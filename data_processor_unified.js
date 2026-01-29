/**
 * UNIFIED DATA PROCESSOR
 * 
 * Combines all data sources (patients, staff, services weekly) into a single 
 * comprehensive dataset optimized for Option A tasks:
 * 
 * Task 1: Calendar Heatmap + Time-Series
 * Task 2: Violin Plot (Event Impact)
 * Task 3: Scatterplot Explorer (Staff Composition vs Performance) - NEW
 * Task 4: (Optional reference/extensions)
 * Task 5: Parallel Coordinate Plot (Multivariate Analysis) - NEW
 * 
 * Output: serviceWeeklyData = Array of normalized week-service records with all computed fields
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * MAIN EXPORT: Process all CSV data into unified serviceWeeklyData
 * 
 * Call this once during app initialization
 * 
 * @param {Array} servicesWeeklyCSV - rows from services_weekly.csv
 * @param {Array} staffScheduleCSV - rows from staff_schedule.csv
 * @param {Array} staffMasterCSV - rows from staff.csv (optional, for total staff counts)
 * @returns {Array} serviceWeeklyData - normalized dataset for all tasks
 */
export function processAllData(servicesWeeklyCSV, staffScheduleCSV, staffMasterCSV = []) {
  console.log("🔄 Processing unified dataset...");
  
  // ========== PHASE 1: Process Staff Schedule → Presence Metrics ==========
  const staffPresenceData = _computeStaffPresenceMetrics(staffScheduleCSV, staffMasterCSV);
  console.log("✅ Staff presence metrics computed");
  
  // ========== PHASE 2: Enrich services_weekly with all derived fields ==========
  const serviceWeeklyData = _enrichServiceWeeklyData(servicesWeeklyCSV, staffPresenceData);
  console.log("✅ Service weekly data enriched");
  
  // ========== PHASE 3: Add stress scores & validation ==========
  const finalData = _addStressScoresAndValidate(serviceWeeklyData);
  console.log("✅ Final dataset ready:", finalData.length, "records");
  
  return finalData;
}

// ============================================================================
// PHASE 1: STAFF SCHEDULE PROCESSING
// ============================================================================

/**
 * Compute staff presence metrics per (week, service)
 * 
 * Outputs:
 * - staffPresenceRate: % of assigned staff present
 * - presentCount: # present this week-service
 * - totalAssigned: # assigned to this service overall
 * - pctDoctor, pctNurse, pctTechnician, etc.: role composition among present staff
 */
function _computeStaffPresenceMetrics(staffScheduleCSV, staffMasterCSV) {
  // Step 1: Get total staff per service (baseline denominator)
  const staffByService = d3.rollup(
    staffMasterCSV && staffMasterCSV.length > 0 ? staffMasterCSV : staffScheduleCSV,
    v => new Set(v.map(d => String(d.staff_id))).size,
    d => String(d.service)
  );

  // Step 2: Collect all unique roles (for consistent column generation)
  const allRoles = Array.from(
    new Set(
      staffScheduleCSV
        .map(d => String(d.role || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  console.log("   Roles found:", allRoles);

  // Step 3: Compute presence + composition per (week, service)
  const presenceByWeekService = d3.rollup(
    staffScheduleCSV,
    (groupRows) => {
      const week = +groupRows[0].week;
      const service = String(groupRows[0].service);
      const totalAssigned = staffByService.get(service) || 0;

      // Filter to present staff only
      const presentRows = groupRows.filter(d => +d.present === 1);
      const presentCount = presentRows.length;

      // Compute presence rate
      const staffPresenceRate = totalAssigned > 0 ? presentCount / totalAssigned : 0;

      // Count roles among PRESENT staff
      const roleCounts = d3.rollup(
        presentRows,
        vv => vv.length,
        d => String(d.role || "").trim().toLowerCase()
      );

      // Build role percentage object
      const pctByRole = {};
      for (const role of allRoles) {
        const count = roleCounts.get(role) || 0;
        pctByRole[_roleFieldName(role)] = presentCount > 0 ? count / presentCount : 0;
      }

      return {
        week,
        service,
        totalAssignedStaff: totalAssigned,
        staffPresentCount: presentCount,
        staffPresenceRate: Math.round(staffPresenceRate * 10000) / 10000, // 4 decimals
        ...pctByRole
      };
    },
    d => +d.week,
    d => String(d.service)
  );

  // Return as flat array for easier lookup
  const result = [];
  for (const [week, byService] of presenceByWeekService) {
    for (const [service, metrics] of byService) {
      result.push({ week, service, ...metrics });
    }
  }

  return result;
}

// ============================================================================
// PHASE 2: ENRICH SERVICES_WEEKLY DATA
// ============================================================================

/**
 * Merge services_weekly with computed staff metrics
 * 
 * INPUT (services_weekly.csv expected columns):
 * - week, month, service, event
 * - available_beds, patients_admitted, patients_refused, patients_request
 * - staff_morale, patient_satisfaction
 * 
 * COMPUTES:
 * - occupancy: patients_admitted / available_beds
 * - pct_staff_present: staffPresenceRate * 100 (for Task 3 scatterplot)
 * - All role percentages (pctDoctor, pctNurse, etc.)
 * 
 * OUTPUT: enriched row with 15+ fields
 */
function _enrichServiceWeeklyData(servicesWeeklyCSV, staffPresenceData) {
  // Build lookup map: week-service → staff metrics
  const staffLookup = new Map();
  for (const row of staffPresenceData) {
    const key = `${row.week}_${row.service}`;
    staffLookup.set(key, row);
  }

  // Enrich each service-week row
  return servicesWeeklyCSV.map(d => {
    const week = +d.week;
    const service = String(d.service);
    const available_beds = +d.available_beds;
    const patients_admitted = +d.patients_admitted;
    const patients_refused = +d.patients_refused;

    // Base fields
    const base = {
      week,
      month: +d.month || Math.ceil(week / 4.33),
      service,
      event: (d.event && String(d.event).trim()) ? String(d.event).trim() : "none",

      // Service capacity & demand
      available_beds,
      patients_admitted,
      patients_refused,
      patients_request: +d.patients_request,
      occupancy: available_beds > 0 ? patients_admitted / available_beds : 0,

      // Staff & patient outcomes
      staff_morale: +d.staff_morale || 65,
      patient_satisfaction: +d.patient_satisfaction || 75
    };

    // Look up staff metrics for this week-service
    const staffKey = `${week}_${service}`;
    const staffMetrics = staffLookup.get(staffKey);

    if (!staffMetrics) {
      // No staff data for this week-service → fill defaults
      return {
        ...base,
        totalAssignedStaff: 0,
        staffPresentCount: 0,
        staffPresenceRate: 0,
        pct_staff_present: 0,  // For Task 3 scatterplot
        pctDoctor: 0,
        pctNurse: 0,
        pctTechnician: 0
      };
    }

    // Merge base + staff metrics
    return {
      ...base,
      totalAssignedStaff: staffMetrics.totalAssignedStaff,
      staffPresentCount: staffMetrics.staffPresentCount,
      staffPresenceRate: staffMetrics.staffPresenceRate,
      pct_staff_present: staffMetrics.staffPresenceRate * 100, // Convert to 0-100 for Task 3
      pctDoctor: staffMetrics.pctDoctor || 0,
      pctNurse: staffMetrics.pctNurse || 0,
      pctTechnician: staffMetrics.pctTechnician || 0
    };
  });
}

// ============================================================================
// PHASE 3: ADD STRESS SCORES & VALIDATION
// ============================================================================

/**
 * Compute stress indicators and validate all fields
 * 
 * ADDS:
 * - stress_score: 1 if (morale < 60 AND refusals > 100), else 0
 *                 (indicates crisis: low staff morale + high patient overflow)
 * - stress_level: "low" | "moderate" | "high" (for PCP opacity)
 */
function _addStressScoresAndValidate(serviceWeeklyData) {
  return serviceWeeklyData.map(d => {
    const morale = +d.staff_morale;
    const refusals = +d.patients_refused;
    const occupancy = +d.occupancy;

    // Binary stress: low morale + high refusals
    const stress_score = (morale < 60 && refusals > 100) ? 1 : 0;

    // Continuous stress level for opacity encoding in PCP
    const stress_level = 
      (morale < 50 && refusals > 150) ? "high" :
      (morale < 60 && refusals > 100) ? "moderate" :
      "low";

    return {
      ...d,
      stress_score,
      stress_level,
      // Ensure all numeric fields are valid
      week: Math.max(1, Math.min(52, +d.week || 1)),
      available_beds: Math.max(0, +d.available_beds || 0),
      patients_refused: Math.max(0, +d.patients_refused || 0),
      staff_morale: Math.max(31, Math.min(99, +d.staff_morale || 65)),
      patient_satisfaction: Math.max(60, Math.min(99, +d.patient_satisfaction || 75)),
      occupancy: Math.max(0, Math.min(1, +d.occupancy || 0)),
      pct_staff_present: Math.max(0, Math.min(100, +d.pct_staff_present || 0))
    };
  }).sort((a, b) => a.week - b.week || a.service.localeCompare(b.service));
}

// ============================================================================
// TASK-SPECIFIC EXPORT FUNCTIONS (Optional convenience functions)
// ============================================================================

/**
 * Export data optimized for Task 1 (Calendar Heatmap + Time-Series)
 * 
 * Groups by week, aggregates metrics across all services
 * 
 * @param {Array} serviceWeeklyData - output from processAllData()
 * @returns {Array} weeklyAggregated - one row per week
 */
export function getTask1Data(serviceWeeklyData) {
  return d3.flatRollup(
    serviceWeeklyData,
    (group) => ({
      refusals: d3.sum(group, d => d.patients_refused),
      morale: d3.mean(group, d => d.staff_morale),
      satisfaction: d3.mean(group, d => d.patient_satisfaction),
      eventType: group.map(d => d.event).find(e => e !== "none") || "none",
      occupancy: d3.mean(group, d => d.occupancy)
    }),
    d => d.week
  ).map(([week, metrics]) => ({
    week: +week,
    month: Math.ceil(week / 4.33),
    ...metrics
  }));
}

/**
 * Export data optimized for Task 2 (Violin Plot by Event)
 * 
 * Groups by event type
 * 
 * @param {Array} serviceWeeklyData - output from processAllData()
 * @param {string} metric - metric to analyze ("staff_morale", "patient_satisfaction", "occupancy")
 * @returns {Array} byEvent - stratified by event type
 */
export function getTask2Data(serviceWeeklyData, metric = "staff_morale") {
  return serviceWeeklyData.map(d => ({
    event: d.event,
    service: d.service,
    week: d.week,
    [metric]: d[metric],
    stress_level: d.stress_level
  }));
}

/**
 * Export data optimized for Task 3 (Scatterplot: Staff Composition vs Performance)
 * 
 * Keeps all dimensions with multiple channels:
 * - X: pct_staff_present (0-100%)
 * - Y: staff_morale (31-99)
 * - Color: event type
 * - Size: patients_refused
 * - Opacity: patient_satisfaction
 * - Border: service type
 * 
 * @param {Array} serviceWeeklyData - output from processAllData()
 * @returns {Array} scatterData - ready for D3 scatter plot
 */
export function getTask3Data(serviceWeeklyData) {
  return serviceWeeklyData.map(d => ({
    // Position axes
    week: d.week,
    pct_staff_present: d.pct_staff_present,  // X-axis
    staff_morale: d.staff_morale,             // Y-axis
    
    // Encoding channels
    service: d.service,
    event: d.event,
    patients_refused: d.patients_refused,
    patient_satisfaction: d.patient_satisfaction,
    occupancy: d.occupancy,
    
    // Stress indicators
    stress_score: d.stress_score,
    stress_level: d.stress_level
  }));
}

/**
 * Export data optimized for Task 5 (Parallel Coordinate Plot)
 * 
 * All rows with 5 primary axes:
 * 1. week (1-52)
 * 2. available_beds (8-74)
 * 3. patients_refused (0-363)
 * 4. staff_morale (31-99)
 * 5. patient_satisfaction (60-99)
 * 
 * Plus encoding dimensions:
 * - Color: service type
 * - Opacity: stress_level
 * 
 * @param {Array} serviceWeeklyData - output from processAllData()
 * @returns {Array} pcpData - ready for parallel coordinate plot
 */
export function getTask5Data(serviceWeeklyData) {
  return serviceWeeklyData.map(d => ({
    // 5 Parallel axes
    week: d.week,
    available_beds: d.available_beds,
    patients_refused: d.patients_refused,
    staff_morale: d.staff_morale,
    patient_satisfaction: d.patient_satisfaction,
    
    // Categorical encoding
    service: d.service,
    event: d.event,
    
    // Stress indicators for opacity/highlighting
    stress_score: d.stress_score,
    stress_level: d.stress_level,
    
    // Additional context
    occupancy: d.occupancy,
    pct_staff_present: d.pct_staff_present,
    staffPresentCount: d.staffPresentCount
  }));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert role name to standardized field name
 * Example: "doctor" → "pctDoctor", "nurse" → "pctNurse"
 */
function _roleFieldName(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "pctOther";
  return `pct${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

/**
 * Validate and normalize all numeric fields
 */
function _validateNumeric(value, min, max, defaultVal = 0) {
  const num = +value;
  if (isNaN(num)) return defaultVal;
  return Math.max(min, Math.min(max, num));
}

// ============================================================================
// DATA SCHEMA DOCUMENTATION
// ============================================================================

/**
 * UNIFIED DATASET SCHEMA
 * 
 * Each row represents one (week, service) combination
 * Total rows: 208 (52 weeks × 4 services)
 * 
 * DIMENSIONS:
 * ├─ TEMPORAL
 * │  ├─ week [1-52] Integer
 * │  └─ month [1-12] Integer (derived: ceil(week / 4.33))
 * │
 * ├─ CATEGORICAL
 * │  ├─ service [Emergency, ICU, Surgery, General_Medicine] String
 * │  └─ event [none, flu, Other] String
 * │
 * ├─ SERVICE CAPACITY
 * │  ├─ available_beds [8-74] Integer
 * │  ├─ patients_admitted Integer
 * │  ├─ patients_refused [0-363] Integer (overflow demand)
 * │  ├─ patients_request Integer
 * │  └─ occupancy [0-1] Float (admitted / beds)
 * │
 * ├─ OUTCOMES
 * │  ├─ staff_morale [31-99] Integer
 * │  └─ patient_satisfaction [60-99] Integer
 * │
 * ├─ STAFF COMPOSITION
 * │  ├─ totalAssignedStaff Integer
 * │  ├─ staffPresentCount Integer
 * │  ├─ staffPresenceRate [0-1] Float
 * │  ├─ pct_staff_present [0-100] Float (percentage form)
 * │  ├─ pctDoctor [0-1] Float (% of present staff)
 * │  ├─ pctNurse [0-1] Float
 * │  └─ pctTechnician [0-1] Float
 * │
 * └─ DERIVED STRESS INDICATORS
 *    ├─ stress_score [0,1] Binary (morale < 60 AND refusals > 100)
 *    └─ stress_level [low, moderate, high] String
 * 
 * USAGE:
 * ├─ Task 1 (Calendar): use week, refusals, morale, eventType
 * ├─ Task 2 (Violin): use event, service, [metric], stress_level
 * ├─ Task 3 (Scatterplot): use pct_staff_present (X), staff_morale (Y),
 * │                         patients_refused (size), event (color), 
 * │                         patient_satisfaction (opacity)
 * └─ Task 5 (PCP): use week, available_beds, patients_refused, 
 *                   staff_morale, patient_satisfaction as 5 axes;
 *                   service (color), stress_level (opacity)
 */
