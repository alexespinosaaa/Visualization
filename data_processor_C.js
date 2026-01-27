// data_processor_C.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Person C Processor (Task 3 + Task 4)
 *
 * Inputs:
 *  - servicesWeeklyRows: rows from services_weekly.csv (service-week metrics)
 *  - staffScheduleRows: rows from staff_schedule.csv (week, staff_id, role, service, present)
 *
 * Output:
 *  - Array of { week, month, service, eventType, refusals, morale, satisfaction, occupancy, ...,
 *              staffPresenceRate, staffPresent, pctDoctor, pctNurse, ... }
 *
 * Notes:
 *  - staffPresent is derived from staffPresenceRate >= threshold (default 0.8)
 *  - pct<Role> are computed among PRESENT staff that week for that service; if none present -> 0
 */
export function processDataForTask3and4(servicesWeeklyRows, staffScheduleRows, opts = {}) {
  const threshold = (opts.staffPresenceThreshold ?? 0.8);

  // ---------- 1) Baseline staff per service (denominator for presence rate) ----------
  // staff_schedule contains staff_id + service, so we can compute total assigned staff per service.
  const staffByService = d3.rollup(
    staffScheduleRows,
    v => new Set(v.map(d => String(d.staff_id))).size,
    d => String(d.service)
  );

  // Also collect the set of all roles seen (used to create pct<Role> fields consistently).
  const allRoles = Array.from(
    new Set(staffScheduleRows.map(d => String(d.role).trim().toLowerCase()).filter(Boolean))
  ).sort();

  // ---------- 2) Presence + composition per (week, service) ----------
  // For each (week, service), compute:
  // - presentCount
  // - totalCount (assigned staff for that service)
  // - presenceRate
  // - role shares among present staff
  const presenceByWeekService = d3.rollup(
    staffScheduleRows,
    (v) => {
      const service = String(v[0].service);
      const week = +v[0].week;

      const totalAssigned = staffByService.get(service) || 0;

      const presentRows = v.filter(d => +d.present === 1);
      const presentCount = presentRows.length;

      const staffPresenceRate = totalAssigned > 0 ? presentCount / totalAssigned : 0;

      // role counts among present staff
      const roleCounts = d3.rollup(
        presentRows,
        vv => vv.length,
        d => String(d.role).trim().toLowerCase()
      );

      // build pct<Role> object (stable keys)
      const pctByRole = {};
      for (const r of allRoles) {
        const count = roleCounts.get(r) || 0;
        pctByRole[`pct${capitalize(r)}`] = presentCount > 0 ? count / presentCount : 0;
      }

      return {
        week,
        service,
        totalAssigned,
        presentCount,
        staffPresenceRate,
        staffPresent: staffPresenceRate >= threshold ? 1 : 0,
        ...pctByRole
      };
    },
    d => +d.week,
    d => String(d.service)
  );

  // Helper to fetch presence object for a given week/service
  function getPresence(week, service) {
    const byWeek = presenceByWeekService.get(+week);
    if (!byWeek) return null;
    return byWeek.get(String(service)) || null;
  }

  // ---------- 3) Merge into services_weekly rows ----------
  // This keeps the same base shape as your processDataForTask2and5 output.
  const out = servicesWeeklyRows.map(d => {
    const week = +d.week;
    const available_beds = +d.available_beds;
    const admitted = +d.patients_admitted;

    const base = {
      week,
      month: +d.month,
      service: String(d.service),

      eventType: (d.event && String(d.event).trim()) ? String(d.event).trim() : "none",

      refusals: +d.patients_refused,
      morale: +d.staff_morale,
      satisfaction: +d.patient_satisfaction,
      occupancy: available_beds > 0 ? admitted / available_beds : 0,

      available_beds,
      patients_request: +d.patients_request,
      patients_admitted: admitted
    };

    const p = getPresence(week, base.service);

    // If staffing info missing for this service-week, fill safe defaults.
    if (!p) {
      const pctDefaults = {};
      for (const r of allRoles) pctDefaults[`pct${capitalize(r)}`] = 0;

      return {
        ...base,
        totalAssigned: 0,
        presentCount: 0,
        staffPresenceRate: 0,
        staffPresent: 0,
        ...pctDefaults
      };
    }

    return {
      ...base,
      totalAssigned: p.totalAssigned,
      presentCount: p.presentCount,
      staffPresenceRate: p.staffPresenceRate,
      staffPresent: p.staffPresent,
      // pctDoctor, pctNurse, ...
      ...Object.fromEntries(
        allRoles.map(r => [`pct${capitalize(r)}`, p[`pct${capitalize(r)}`] ?? 0])
      )
    };
  });

  return out;
}

// --- tiny helpers ---
function capitalize(s) {
  const t = String(s || "");
  return t.length ? t[0].toUpperCase() + t.slice(1) : t;
}
