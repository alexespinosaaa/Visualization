// main.js - ABU ONLY + TWO SCATTER VIEWS (Task3 + Task4) + case-insensitive filters
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import {
  processAllData as processABU,
  getTask1Data,
  getTask2Data,
  getTask3Data,
  getTask5Data
} from "./data_processor_final.js";

import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";
import * as EventImpactView from "./view-event-impact.js";

// ✅ Task 3 scatter (6D linked scatter)
import * as ScatterTask3View from "./view-scatterplot-linked.js";

// ✅ Task 4 scatter (dropdown + density + brush)
import * as ScatterTask4View from "./view-scatter.js";

import * as PCPView from "./view-pcp.js";

// -------------------- STATE (legacy metric names) --------------------
// ✅ Minimal change: add selectedStressLevel + allow selectedService to be string OR array
let state = {
  selectedWeek: null,
  selectedService: null,        // string | string[] | null
  selectedEventType: null,
  selectedStressLevel: null,    // "low" | "moderate" | "high" | null
  timeRange: null,
  metric: "refusals",
  stressOnly: false,
  zoomTransform: null
};
window.__dashState = state;

// -------------------- DATA PATHS --------------------
const DATA_DIR = "./Hospital Beds Management/";
const SERVICES_CSV = DATA_DIR + "services_weekly.csv";
const STAFF_SCHEDULE_CSV = DATA_DIR + "staff_schedule.csv";
const STAFF_CSV = DATA_DIR + "staff.csv";

// -------------------- GLOBAL DATA --------------------
let globalData = {};

// -------------------- NORMALIZERS (filters only) --------------------
function normStr(x) {
  return String(x ?? "").trim().toLowerCase();
}

function normEvent(x) {
  const e = normStr(x);
  if (!e) return "";
  if (e === "none" || e === "normal") return "none";
  if (e.includes("flu") || e.includes("influenza")) return "flu";
  if (e.includes("strike") || e.includes("walkout")) return "strike";
  if (e.includes("donat")) return "donation";
  return e;
}

function normService(x) {
  const s = normStr(x);
  if (!s) return "";
  if (s === "icu") return "icu";
  if (s.includes("emerg")) return "emergency";
  if (s.includes("surg")) return "surgery";
  if (s.includes("general") && s.includes("med")) return "general_medicine";
  if (s === "general_medicine" || s === "general medicine" || s === "general_med" || s === "general_m") return "general_medicine";
  return s;
}

// ✅ Service matcher that supports string OR array (minimal change)
function serviceMatches(rowService, selectedService) {
  if (!selectedService) return true;

  const rowNorm = normService(rowService);

  // array -> match any
  if (Array.isArray(selectedService)) {
    const set = new Set(selectedService.map(normService));
    return set.has(rowNorm);
  }

  // string -> match exact
  return rowNorm === normService(selectedService);
}

// -------------------- FILTERS --------------------
function applyFilters(rows) {
  let out = rows;

  // ✅ multi-service support
  if (state.selectedService) {
    out = out.filter(d => serviceMatches(d.service, state.selectedService));
  }

  if (state.selectedEventType) {
    const targetEvent = normEvent(state.selectedEventType);
    out = out.filter(d => normEvent(d.event) === targetEvent);
  }

  // ✅ NEW: stress level filter from PCP legend (independent of "stressOnly")
  if (state.selectedStressLevel) {
    const target = normStr(state.selectedStressLevel);
    out = out.filter(d => normStr(d.stress_level) === target);
  }

  // existing: stressOnly means stress_score === 1
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
function buildLegacyDatasets(serviceWeeklyDataFiltered) {
  const hospitalWeekly = d3.flatRollup(
    serviceWeeklyDataFiltered,
    (group) => {
      const refusals = d3.sum(group, d => +d.patients_refused);
      const morale = d3.mean(group, d => +d.staff_morale);
      const satisfaction = d3.mean(group, d => +d.patient_satisfaction);
      const occupancy = d3.mean(group, d => +d.occupancy);
      const eventType = group.map(d => d.event).find(e => e && normEvent(e) !== "none") || "none";
      return { refusals, morale, satisfaction, occupancy, eventType: normEvent(eventType) || "none" };
    },
    d => +d.week
  )
    .map(([week, m]) => ({
      week: +week,
      month: Math.ceil(+week / 4.33),
      ...m
    }))
    .sort((a, b) => a.week - b.week);

  const serviceWeekly = serviceWeeklyDataFiltered.map(d => ({
    week: +d.week,
    month: +d.month || Math.ceil(+d.week / 4.33),
    service: String(d.service),
    eventType: String(d.event || "none"),

    // legacy metric names
    refusals: +d.patients_refused,
    morale: +d.staff_morale,
    occupancy: +d.occupancy,
    satisfaction: +d.patient_satisfaction,

    // keep extra context
    stress_level: d.stress_level,
    stress_score: +d.stress_score,

    // pct fields if present
    ...Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith("pct")))
  }));

  return { hospitalWeekly, serviceWeekly };
}

// -------------------- BUILD Task4 DATASET (serviceWeeklyStaff) --------------------
function buildServiceWeeklyStaff(legacyServiceWeekly) {
  return legacyServiceWeekly.map(d => ({
    week: +d.week,
    service: d.service,
    eventType: normEvent(d.eventType || "none") || "none",

    occupancy: +d.occupancy,
    refusals: +d.refusals,
    morale: +d.morale,
    satisfaction: +d.satisfaction,

    ...Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith("pct")))
  }));
}

// -------------------- SAFE WRAPPER --------------------
function safe(name, fn) {
  try { fn(); }
  catch (e) { console.error(`❌ ${name} failed:`, e); }
}

// -------------------- VIEW UPDATES --------------------
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

  safe("ScatterTask3View.update", () =>
    ScatterTask3View.update(document.getElementById("view-scatterplot"), globalData, state, dispatch)
  );

  // IMPORTANT: update signature is (container, data, state)
  safe("ScatterTask4View.update", () =>
    ScatterTask4View.update(document.getElementById("view-scatter"), globalData, state)
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

    // ✅ allow string OR array OR null
    case "SET_SELECTED_SERVICE": {
      const v = action.value;
      if (!v || (Array.isArray(v) && v.length === 0)) {
        state.selectedService = null;
      } else {
        state.selectedService = v; // string or array
      }
      break;
    }

    case "SET_SELECTED_EVENT_TYPE":
      state.selectedEventType = (state.selectedEventType === action.value) ? null : action.value;
      break;

    // ✅ NEW: used by PCP legend
    case "SET_SELECTED_STRESS_LEVEL":
      state.selectedStressLevel = action.value ? String(action.value) : null;
      break;

    case "SET_TIME_RANGE":
      state.timeRange = action.value;
      break;

    case "SET_METRIC":
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
        selectedStressLevel: null,
        timeRange: null,
        metric: "refusals",
        stressOnly: false,
        zoomTransform: null
      };
      break;
  }

  window.__dashState = state;

  if (globalData._fullServiceWeeklyData) {
    const filtered = applyFilters(globalData._fullServiceWeeklyData);
    const legacy = buildLegacyDatasets(filtered);

    globalData.serviceWeeklyData = filtered;

    // legacy views data
    globalData.hospitalWeekly = legacy.hospitalWeekly;
    globalData.serviceWeekly = legacy.serviceWeekly;

    // Task 4 scatter input
    globalData.serviceWeeklyStaff = buildServiceWeeklyStaff(legacy.serviceWeekly);

    // task data
    globalData.task1Data = getTask1Data(filtered);
    globalData.task2Data = getTask2Data(filtered);
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

    const full = processABU(servicesRows, staffScheduleRows, staffRows);

    const filtered = applyFilters(full);
    const legacy = buildLegacyDatasets(filtered);

    globalData = {
      _fullServiceWeeklyData: full,
      serviceWeeklyData: filtered,

      // legacy views
      hospitalWeekly: legacy.hospitalWeekly,
      serviceWeekly: legacy.serviceWeekly,

      // Task 4 scatter input
      serviceWeeklyStaff: buildServiceWeeklyStaff(legacy.serviceWeekly),

      // task data
      task1Data: getTask1Data(filtered),
      task2Data: getTask2Data(filtered),
      task3Data: getTask3Data(filtered),
      task5Data: getTask5Data(filtered)
    };

    // init views
    safe("CalendarView.init", () =>
      CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch)
    );
    safe("TimeSeriesView.init", () =>
      TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch)
    );
    safe("EventImpactView.init", () =>
      EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch)
    );
    safe("ScatterTask3View.init", () =>
      ScatterTask3View.init(document.getElementById("view-scatterplot"), globalData, state, dispatch)
    );
    // IMPORTANT: init signature is (container, data, state, dispatch)
    safe("ScatterTask4View.init", () =>
      ScatterTask4View.init(document.getElementById("view-scatter"), globalData, state, dispatch)
    );
    safe("PCPView.init", () =>
      PCPView.init(document.getElementById("view-pcp"), globalData, state, dispatch)
    );

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
