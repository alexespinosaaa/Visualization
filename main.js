// main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { processDataForTask1 } from "./data_processor_A.js";
import { processDataForTask2and5 } from "./data_processor_B.js";
import { processDataForTask3and4 } from "./data_processor_C.js";

import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";
import * as EventImpactView from "./view-event-impact.js";
import * as TableView from "./view-table.js";

// Person C
import * as StaffingView from "./view-staffing.js";
import * as ScatterView from "./view-scatter.js";

// ---- GLOBAL STATE (single source of truth) ----
let state = {
  selectedWeek: null,
  timeRange: null,
  zoomTransform: null,
  metric: "refusals",
  selectedEventType: null,
  selectedService: null,
  stressOnly: false
};

// ---- CSV PATHS (edit to your folder) ----
const SERVICES_CSV = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/services_weekly.csv";
const STAFF_SCHEDULE_CSV = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/staff_schedule.csv";

// ---- GLOBAL DATA ----
let globalData = {};

// ---- DISPATCHER (single) ----
function dispatch(action) {
  switch (action.type) {
    case "SET_SELECTED_WEEK":
      state.selectedWeek = (state.selectedWeek === action.value) ? null : action.value;
      break;

    case "SET_TIME_RANGE":
      state.timeRange = action.value;
      break;

    case "SET_ZOOM":
      state.zoomTransform = action.value;
      break;

    case "SET_METRIC":
      state.metric = action.value;
      break;

    case "SET_SELECTED_EVENT_TYPE":
      state.selectedEventType = (state.selectedEventType === action.value) ? null : action.value;
      break;

    case "SET_SELECTED_SERVICE":
      state.selectedService = (state.selectedService === action.value) ? null : action.value;
      break;

    case "SET_STRESS_ONLY":
      state.stressOnly = action.value;
      break;

    case "RESET":
      state.selectedWeek = null;
      state.timeRange = null;
      state.zoomTransform = null;
      state.selectedEventType = null;
      state.selectedService = null;
      state.metric = "refusals";
      state.stressOnly = false;
      break;
  }

  updateAllViews();
}

function updateAllViews() {
  CalendarView.update(document.getElementById("view-calendar"), globalData, state);
  TimeSeriesView.update(document.getElementById("view-timeseries"), globalData, state);
  EventImpactView.update(document.getElementById("view-events"), globalData, state);
  TableView.update(document.getElementById("view-table"), globalData, state);

  // Person C (only if containers exist)
  const staffingEl = document.getElementById("view-staffing");
  const scatterEl = document.getElementById("view-scatter");
  if (staffingEl) StaffingView.update(staffingEl, globalData, state);
  if (scatterEl) ScatterView.update(scatterEl, globalData, state);
}

// ---- INITIALIZATION ----
async function init() {
  try {
    const [servicesRows, staffScheduleRows] = await Promise.all([
      d3.csv(SERVICES_CSV),
      d3.csv(STAFF_SCHEDULE_CSV)
    ]);

    globalData = {
      hospitalWeekly: processDataForTask1(servicesRows),
      serviceWeekly: processDataForTask2and5(servicesRows),
      serviceWeeklyStaff: processDataForTask3and4(servicesRows, staffScheduleRows, {
        staffPresenceThreshold: 0.8
      })
    };

    CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch);
    TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch);
    EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch);
    TableView.init(document.getElementById("view-table"), globalData, state, dispatch);

    // Person C init (only if containers exist)
    const staffingEl = document.getElementById("view-staffing");
    const scatterEl = document.getElementById("view-scatter");
    if (staffingEl) StaffingView.init(staffingEl, globalData, state, dispatch);
    if (scatterEl) ScatterView.init(scatterEl, globalData, state, dispatch);

    updateAllViews();
  } catch (error) {
    console.error("Error loading data:", error);
    document.body.innerHTML += `
      <h3 style="color:red">
        Error loading data.<br>
        Ensure you are running the server from the 'VIS' folder.
      </h3>`;
  }
}

window.dispatch = dispatch;
window.resetState = () => dispatch({ type: "RESET" });

init();
