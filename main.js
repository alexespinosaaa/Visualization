// main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { processDataForTask1 } from "./data_processor_A.js";
import { processDataForTask2and5 } from "./data_processor_B.js";
import { processDataForTask3and4 } from "./data_processor_C.js";

import * as StaffingView from "./view-staffing.js";
import * as ScatterView from "./view-scatter.js";

import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";
import * as EventImpactView from "./view-event-impact.js";
import * as TableView from "./view-table.js";

// GLOBAL STATE
let state = {
    selectedWeek: null,
    timeRange: null,
    zoomTransform: null,
    metric: "refusals",
    selectedEventType: null,
    selectedService: null
};

// CSV PATH
const CSV_PATH = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/services_weekly.csv";
const SERVICES_CSV = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/services_weekly.csv";
const STAFF_SCHEDULE_CSV = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/staff_schedule.csv";
// DISPATCHER
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
            state.selectedEventType =
                (state.selectedEventType === action.value) ? null : action.value;
            break;

        case "SET_SELECTED_SERVICE":
            state.selectedService =
                (state.selectedService === action.value) ? null : action.value;
            break;

        case "RESET":
            state.selectedWeek = null;
            state.timeRange = null;
            state.zoomTransform = null;
            state.selectedEventType = null;
            state.selectedService = null;
            state.metric = "refusals";
            break;
    }

    updateAllViews();
}

let globalData = {};

function updateAllViews() {
  CalendarView.update(document.getElementById("view-calendar"), globalData, state);
  TimeSeriesView.update(document.getElementById("view-timeseries"), globalData, state);
  EventImpactView.update(document.getElementById("view-events"), globalData, state);
  TableView.update(document.getElementById("view-table"), globalData, state);

  // Person C
  StaffingView.update(document.getElementById("view-staffing"), globalData, state);
  ScatterView.update(document.getElementById("view-scatter"), globalData, state);
}

let state = {
  selectedWeek: null,
  timeRange: null,
  zoomTransform: null,
  metric: "refusals",
  selectedEventType: null,
  selectedService: null,
  stressOnly: false
};

function dispatch(action) {
  switch (action.type) {
    // ... your cases ...
    case "SET_STRESS_ONLY":
      state.stressOnly = action.value;
      break;

    case "RESET":
      // ... your resets ...
      state.stressOnly = false;
      break;
  }
  updateAllViews();
}

// INITIALIZATION
async function init() {
  try {
    const [servicesRows, staffScheduleRows] = await Promise.all([
      d3.csv(SERVICES_CSV),
      d3.csv(STAFF_SCHEDULE_CSV)
    ]);

    globalData = {
      hospitalWeekly: processDataForTask1(servicesRows),
      serviceWeekly: processDataForTask2and5(servicesRows),

      // Person C dataset
      serviceWeeklyStaff: processDataForTask3and4(servicesRows, staffScheduleRows, {
        staffPresenceThreshold: 0.8
      })
    };

    CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch);
    TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch);
    EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch);
    TableView.init(document.getElementById("view-table"), globalData, state, dispatch);

    // Person C init (only after you add these containers in HTML)
    StaffingView.init(document.getElementById("view-staffing"), globalData, state, dispatch);
    ScatterView.init(document.getElementById("view-scatter"), globalData, state, dispatch);

    updateAllViews();
  } catch (error) {
    console.error("Error loading data:", error);
  }
}
window.dispatch = dispatch;
window.resetState = () => dispatch({ type: "RESET" });

init();
