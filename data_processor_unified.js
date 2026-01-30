/**
 * UNIFIED DATA PROCESSOR (FIXED)
 *
 * FIXES:
 * ✅ Normalize service names across ALL inputs (services_weekly, staff_schedule, staff_master)
 * ✅ Normalize event values consistently
 * ✅ Prevent missing staffLookup matches due to casing/underscore differences
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// ---------------------------
// Normalization helpers
// ---------------------------
function normalizeService(raw) {
  const s = String(raw ?? "").trim().toLowerCase();

  // handle common variants
  if (s === "icu") return "ICU";
  if (s.includes("emerg")) return "Emergency";
  if (s.includes("surg")) return "Surgery";

  // general medicine variants
  if (s.includes("general") && s.includes("med")) return "General_Medicine";
  if (s === "general_medicine") return "General_Medicine";
  if (s === "general medicine") return "General_Medicine";
  if (s === "general_med") return "General_Medicine";
  if (s === "general_m") return "General_Medicine";

  // already canonical?
  if (raw === "Emergency" || raw === "Surgery" || raw === "General_Medicine" || raw === "ICU") return raw;

  // fallback: convert spaces to underscore + Title-ish
  return String(raw ?? "").trim().replaceAll(" ", "_");
}

function normalizeEvent(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e || e === "none" || e === "normal") return "none";
  if (e === "flu" || e.includes("influenza")) return "flu";
  // everything else -> "Other" to match your mapping
  return "Other";
}

/**
 * MAIN EXPORT
 */
export function processAllData(servicesWeeklyCSV, staffScheduleCSV, staffMasterCSV = []) {
  console.log("🔄 Processing unified dataset...");

  const staffPresenceData = _computeStaffPresenceMetrics(staffScheduleCSV, staffMasterCSV);
  console.log("✅ Staff presence metrics computed");

  const serviceWeeklyData = _enrichServiceWeeklyData(servicesWeeklyCSV, staffPresenceData);
  console.log("✅ Service weekly data enriched");

  const finalData = _addStressScoresAndValidate(serviceWeeklyData);
  console.log("✅ Final dataset ready:", finalData.length, "records");

  return finalData;
}

// ============================================================================
// PHASE 1: STAFF SCHEDULE PROCESSING
// ============================================================================
function _computeStaffPresenceMetrics(staffScheduleCSV, staffMasterCSV) {
  // IMPORTANT: normalize service strings here too
  const staffSource = staffMasterCSV && staffMasterCSV.length > 0 ? staffMasterCSV : staffScheduleCSV;

  const staffByService = d3.rollup(
    staffSource,
    v => new Set(v.map(d => String(d.staff_id))).size,
    d => normalizeService(d.service)
  );

  const allRoles = Array.from(
    new Set(
      staffScheduleCSV
        .map(d => String(d.role || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  console.log("   Roles found:", allRoles);

  const presenceByWeekService = d3.rollup(
    staffScheduleCSV,
    (groupRows) => {
      const week = +groupRows[0].week;
      const service = normalizeService(groupRows[0].service);
      const totalAssigned = staffByService.get(service) || 0;

      const presentRows = groupRows.filter(d => +d.present === 1);
      const presentCount = presentRows.length;

      const staffPresenceRate = totalAssigned > 0 ? presentCount / totalAssigned : 0;

      const roleCounts = d3.rollup(
        presentRows,
        vv => vv.length,
        d => String(d.role || "").trim().toLowerCase()
      );

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
        staffPresenceRate: Math.round(staffPresenceRate * 10000) / 10000,
        ...pctByRole
      };
    },
    d => +d.week,
    d => normalizeService(d.service)
  );

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
function _enrichServiceWeeklyData(servicesWeeklyCSV, staffPresenceData) {
  const staffLookup = new Map();
  for (const row of staffPresenceData) {
    const key = `${row.week}_${row.service}`;
    staffLookup.set(key, row);
  }

  return servicesWeeklyCSV.map(d => {
    const week = +d.week;
    const service = normalizeService(d.service);

    const available_beds = +d.available_beds;
    const patients_admitted = +d.patients_admitted;
    const patients_refused = +d.patients_refused;

    const base = {
      week,
      month: +d.month || Math.ceil(week / 4.33),
      service,
      event: normalizeEvent(d.event),

      available_beds,
      patients_admitted,
      patients_refused,
      patients_request: +d.patients_request,

      occupancy: available_beds > 0 ? patients_admitted / available_beds : 0,

      staff_morale: +d.staff_morale || 65,
      patient_satisfaction: +d.patient_satisfaction || 75
    };

    const staffKey = `${week}_${service}`;
    const staffMetrics = staffLookup.get(staffKey);

    if (!staffMetrics) {
      return {
        ...base,
        totalAssignedStaff: 0,
        staffPresentCount: 0,
        staffPresenceRate: 0,
        pct_staff_present: 0,
        pctDoctor: 0,
        pctNurse: 0,
        pctTechnician: 0
      };
    }

    return {
      ...base,
      totalAssignedStaff: staffMetrics.totalAssignedStaff,
      staffPresentCount: staffMetrics.staffPresentCount,
      staffPresenceRate: staffMetrics.staffPresenceRate,
      pct_staff_present: staffMetrics.staffPresenceRate * 100,
      pctDoctor: staffMetrics.pctDoctor || 0,
      pctNurse: staffMetrics.pctNurse || 0,
      pctTechnician: staffMetrics.pctTechnician || 0
    };
  });
}

// ============================================================================
// PHASE 3: STRESS + VALIDATION
// ============================================================================
function _addStressScoresAndValidate(serviceWeeklyData) {
  return serviceWeeklyData
    .map(d => {
      const morale = +d.staff_morale;
      const refusals = +d.patients_refused;

      const stress_score = (morale < 60 && refusals > 100) ? 1 : 0;

      const stress_level =
        (morale < 50 && refusals > 150) ? "high" :
        (morale < 60 && refusals > 100) ? "moderate" :
        "low";

      return {
        ...d,
        stress_score,
        stress_level,
        week: Math.max(1, Math.min(52, +d.week || 1)),
        available_beds: Math.max(0, +d.available_beds || 0),
        patients_refused: Math.max(0, +d.patients_refused || 0),
        staff_morale: Math.max(31, Math.min(99, +d.staff_morale || 65)),
        patient_satisfaction: Math.max(60, Math.min(99, +d.patient_satisfaction || 75)),
        occupancy: Math.max(0, Math.min(1, +d.occupancy || 0)),
        pct_staff_present: Math.max(0, Math.min(100, +d.pct_staff_present || 0))
      };
    })
    .sort((a, b) => a.week - b.week || a.service.localeCompare(b.service));
}

// ============================================================================
// Task exports (unchanged)
// ============================================================================
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

export function getTask2Data(serviceWeeklyData, metric = "staff_morale") {
  return serviceWeeklyData.map(d => ({
    event: d.event,
    service: d.service,
    week: d.week,
    [metric]: d[metric],
    stress_level: d.stress_level
  }));
}

export function getTask3Data(serviceWeeklyData) {
  return serviceWeeklyData.map(d => ({
    week: d.week,
    pct_staff_present: d.pct_staff_present,
    staff_morale: d.staff_morale,
    service: d.service,
    event: d.event,
    patients_refused: d.patients_refused,
    patient_satisfaction: d.patient_satisfaction,
    occupancy: d.occupancy,
    stress_score: d.stress_score,
    stress_level: d.stress_level
  }));
}

export function getTask5Data(serviceWeeklyData) {
  return serviceWeeklyData.map(d => ({
    week: d.week,
    available_beds: d.available_beds,
    patients_refused: d.patients_refused,
    staff_morale: d.staff_morale,
    patient_satisfaction: d.patient_satisfaction,
    service: d.service,
    event: d.event,
    stress_score: d.stress_score,
    stress_level: d.stress_level,
    occupancy: d.occupancy,
    pct_staff_present: d.pct_staff_present,
    staffPresentCount: d.staffPresentCount
  }));
}

// ============================================================================
// Helper
// ============================================================================
function _roleFieldName(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "pctOther";
  return `pct${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}
