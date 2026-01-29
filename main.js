// main.js - FIXED: legacy-view compatibility + unified processor (Option A layout)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import {
  processAllData,
  getTask3Data,
  getTask5Data
} from "./data_processor_unified.js";

import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";
import * as EventImpactView from "./view-event-impact.js";
import * as ScatterplotView from "./view-scatterplot-linked.js";
import * as PCPView from "./view-pcp.js";

// -------------------- STATE (use legacy metric names!) --------------------
let state = {
  selectedWeek: null,
  selectedService: null,
  selectedEventType: null,
  timeRange: null,
  metric: "refusals",     // ✅ must match what views expect
  stressOnly: false,
  zoomTransform: null
};
window.__dashState = state;

// -------------------- DATA PATHS (based on your repo screenshot) --------------------
const DATA_DIR = "./Hospital Beds Management/";
const SERVICES_CSV = DATA_DIR + "services_weekly.csv";
const STAFF_SCHEDULE_CSV = DATA_DIR + "staff_schedule.csv";
const STAFF_CSV = DATA_DIR + "staff.csv";

// -------------------- GLOBAL DATA --------------------
let globalData = {};

// -------------------- FILTERS --------------------
function applyFilters(rows) {
  let out = rows;

  if (state.selectedService) {
    out = out.filter(d => String(d.service) === String(state.selectedService));
  }
  if (state.selectedEventType) {
    out = out.filter(d => String(d.event) === String(state.selectedEventType));
  }
  if (state.stressOnly) {
    out = out.filter(d => +d.stress_score === 1);
  }
  if (state.timeRange && Array.isArray(state.timeRange) && state.timeRange.length === 2) {
    const [a, b] = state.timeRange;
    out = out.filter(d => +d.week >= +a && +d.week <= +b);
  }
  return out;
}

// -------------------- LEGACY SHAPE ADAPTER --------------------
// Builds the EXACT fields your current views expect:
// - hospitalWeekly: [{week, month, refusals, morale, occupancy, satisfaction, eventType}]
// - serviceWeekly : [{week, service, refusals, morale, occupancy, satisfaction, eventType}]
function buildLegacyDatasets(serviceWeeklyDataFiltered) {
  const hospitalWeekly = d3.flatRollup(
    serviceWeeklyDataFiltered,
    (group) => {
      const refusals = d3.sum(group, d => +d.patients_refused);
      const morale = d3.mean(group, d => +d.staff_morale);
      const satisfaction = d3.mean(group, d => +d.patient_satisfaction);
      const occupancy = d3.mean(group, d => +d.occupancy);
      const eventType = group.map(d => d.event).find(e => e && e !== "none") || "none";

      return { refusals, morale, satisfaction, occupancy, eventType };
    },
    d => +d.week
  ).map(([week, m]) => ({
    week: +week,
    month: Math.ceil(+week / 4.33),
    ...m
  })).sort((a, b) => a.week - b.week);

  const serviceWeekly = serviceWeeklyDataFiltered.map(d => ({
    week: +d.week,
    month: +d.month || Math.ceil(+d.week / 4.33),
    service: String(d.service),
    eventType: String(d.event || "none"),

    // legacy metric names:
    refusals: +d.patients_refused,
    morale: +d.staff_morale,
    occupancy: +d.occupancy,
    satisfaction: +d.patient_satisfaction,

    // keep extra context (harmless)
    stress_level: d.stress_level,
    stress_score: +d.stress_score
  }));

  return { hospitalWeekly, serviceWeekly };
}

// -------------------- SAFE UPDATE --------------------
function safe(name, fn) {
  try { fn(); }
  catch (e) { console.error(`❌ ${name} failed:`, e); }
}

function updateAllViews() {
  if (!globalData || !globalData.hospitalWeekly) return;

  safe("CalendarView.update", () =>
    CalendarView.update(document.getElementById("view-calendar"), globalData, state, dispatch)
  );

  safe("TimeSeriesView.update", () =>
    TimeSeriesView.update(document.getElementById("view-timeseries"), globalData, state, dispatch)
  );

  safe("EventImpactView.update", () =>
    EventImpactView.update(document.getElementById("view-events"), globalData, state, dispatch)
  );

  safe("ScatterplotView.update", () =>
    ScatterplotView.update(document.getElementById("view-scatterplot"), globalData, state, dispatch)
  );

  safe("PCPView.update", () =>
    PCPView.update(document.getElementById("view-pcp"), globalData, state, dispatch)
  );
}

// -------------------- DISPATCH --------------------
function dispatch(action) {
  switch (action.type) {
    case "SET_SELECTED_WEEK":
      state.selectedWeek = (state.selectedWeek === action.value) ? null : action.value;
      break;

    case "SET_SELECTED_SERVICE":
      state.selectedService = (state.selectedService === action.value) ? null : action.value;
      break;

    case "SET_SELECTED_EVENT_TYPE":
      state.selectedEventType = (state.selectedEventType === action.value) ? null : action.value;
      break;

    case "SET_TIME_RANGE":
      state.timeRange = action.value;
      break;

    case "SET_METRIC":
      // IMPORTANT: must be one of: refusals, morale, occupancy, satisfaction
      state.metric = action.value;
      break;

    case "SET_STRESS_ONLY":
      state.stressOnly = !!action.value;
      break;

    case "SET_ZOOM":
      state.zoomTransform = action.value;
      break;

    case "RESET":
      state = {
        selectedWeek: null,
        selectedService: null,
        selectedEventType: null,
        timeRange: null,
        metric: "refusals",
        stressOnly: false,
        zoomTransform: null
      };
      break;
  }

  window.__dashState = state;

  // rebuild all derived datasets from the stored full dataset
  if (globalData._fullServiceWeeklyData) {
    const filtered = applyFilters(globalData._fullServiceWeeklyData);
    const legacy = buildLegacyDatasets(filtered);

    globalData.serviceWeeklyData = filtered; // unified base (optional)

    // ✅ what the legacy views need:
    globalData.hospitalWeekly = legacy.hospitalWeekly;
    globalData.serviceWeekly = legacy.serviceWeekly;

    // ✅ what the new views need:
    globalData.task3Data = getTask3Data(filtered);
    globalData.task5Data = getTask5Data(filtered);
  }

  updateAllViews();
}

window.dispatch = dispatch;
window.resetState = () => dispatch({ type: "RESET" });

// -------------------- INIT --------------------
async function init() {
  try {
    console.log("📡 Loading CSV files...");
    console.log("   SERVICES_CSV:", SERVICES_CSV);
    console.log("   STAFF_SCHEDULE_CSV:", STAFF_SCHEDULE_CSV);
    console.log("   STAFF_CSV:", STAFF_CSV);

    const servicesRows = await d3.csv(SERVICES_CSV);
    const staffScheduleRows = await d3.csv(STAFF_SCHEDULE_CSV);
    const staffRows = await d3.csv(STAFF_CSV).catch(() => []);

    if (!servicesRows?.length) throw new Error(`services_weekly.csv empty or not found: ${SERVICES_CSV}`);
    if (!staffScheduleRows?.length) throw new Error(`staff_schedule.csv empty or not found: ${STAFF_SCHEDULE_CSV}`);

    const full = processAllData(servicesRows, staffScheduleRows, staffRows);
    const filtered = applyFilters(full);
    const legacy = buildLegacyDatasets(filtered);

    globalData = {
      _fullServiceWeeklyData: full,
      serviceWeeklyData: filtered,

      // ✅ REQUIRED by your current view files:
      hospitalWeekly: legacy.hospitalWeekly,
      serviceWeekly: legacy.serviceWeekly,

      // ✅ NEW views:
      task3Data: getTask3Data(filtered),
      task5Data: getTask5Data(filtered)
    };

    // init views
    safe("CalendarView.init", () => CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch));
    safe("TimeSeriesView.init", () => TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch));
    safe("EventImpactView.init", () => EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch));
    safe("ScatterplotView.init", () => ScatterplotView.init(document.getElementById("view-scatterplot"), globalData, state, dispatch));
    safe("PCPView.init", () => PCPView.init(document.getElementById("view-pcp"), globalData, state, dispatch));

    updateAllViews();
    console.log("✅ Initialization complete.");

  } catch (error) {
    console.error("❌ Error during initialization:", error);

    const msg = document.createElement("div");
    msg.style.cssText =
      "margin:16px;padding:12px;border:1px solid #ffb3b3;background:#ffecec;color:#b00020;border-radius:10px;font-family:Inter,sans-serif;";
    msg.innerHTML = `
      <strong>Error loading data:</strong> ${error.message}<br>
      <small>Open DevTools (F12) → Console + Network to see what failed.</small>
    `;
    document.body.prepend(msg);
  }
}

init();
