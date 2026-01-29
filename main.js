// main.js - UPDATED for Option A
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// ✅ NEW: Import unified processor
import { 
  processAllData, 
  getTask1Data, 
  getTask2Data, 
  getTask3Data, 
  getTask5Data 
} from "./data_processor_unified.js";

// ✅ KEEP: Existing view imports
import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";
import * as EventImpactView from "./view-event-impact.js";

// ❌ DELETE: Old views (commented out for now)
// import * as TableView from "./view-table.js";
// import * as StaffingView from "./view-staffing.js";
// import * as ScatterView from "./view-scatter.js";

// 🆕 NEW: Import new views
import * as PCPView from "./view-pcp.js";
import * as ScatterplotView from "./view-scatterplot-linked.js";


// ---- GLOBAL STATE ----
let state = {
  selectedWeek: null,
  selectedService: null,
  selectedEventType: null,
  timeRange: null,
  metric: "staff_morale",
  stressOnly: false,
  zoomTransform: null
};


// ---- CSV PATHS ----
const SERVICES_CSV = "../Hospital Beds Management/services_weekly.csv";
const STAFF_SCHEDULE_CSV = "../Hospital Beds Management/staff_schedule.csv";
const STAFF_CSV = "../Hospital Beds Management/staff.csv";

// ---- GLOBAL DATA ----
let globalData = {};


// ---- DISPATCHER ----
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
      state.metric = action.value;
      break;

    case "SET_STRESS_ONLY":
      state.stressOnly = action.value;
      break;

    case "SET_ZOOM":
      state.zoomTransform = action.value;
      break;

    case "RESET":
      state.selectedWeek = null;
      state.selectedService = null;
      state.selectedEventType = null;
      state.timeRange = null;
      state.metric = "staff_morale";
      state.stressOnly = false;
      state.zoomTransform = null;
      break;
  }

  updateAllViews();
}


function updateAllViews() {
  CalendarView.update(document.getElementById("view-calendar"), globalData, state, dispatch);
  TimeSeriesView.update(document.getElementById("view-timeseries"), globalData, state, dispatch);
  EventImpactView.update(document.getElementById("view-events"), globalData, state, dispatch);

  // 🆕 NEW: Task 5 (PCP)
  const pcpEl = document.getElementById("view-pcp");
  if (pcpEl) PCPView.update(pcpEl, globalData, state, dispatch);

  // 🆕 NEW: Task 3 (Scatterplot)
  const scatterEl = document.getElementById("view-scatterplot");
  if (scatterEl) ScatterplotView.update(scatterEl, globalData, state, dispatch);
}


// ---- INITIALIZATION ----
async function init() {
  try {
    console.log("📡 Loading CSV files...");
    
    const servicesRows = await d3.csv(SERVICES_CSV).catch(err => {
      console.error("❌ Failed to load services_weekly.csv:", err);
      return [];
    });

    const staffScheduleRows = await d3.csv(STAFF_SCHEDULE_CSV).catch(err => {
      console.error("❌ Failed to load staff_schedule.csv:", err);
      return [];
    });

    const staffRows = await d3.csv(STAFF_CSV).catch(err => {
      console.error("⚠️ staff.csv optional, skipping:", err);
      return [];
    });

    console.log("✅ CSVs loaded:");
    console.log("   Services:", servicesRows.length, "rows");
    console.log("   Staff Schedule:", staffScheduleRows.length, "rows");
    console.log("   Staff:", staffRows.length, "rows");

    if (servicesRows.length === 0) {
      throw new Error("services_weekly.csv is empty or failed to load");
    }

    if (staffScheduleRows.length === 0) {
      throw new Error("staff_schedule.csv is empty or failed to load");
    }

    // ✅ NEW: Single unified processor
    const serviceWeeklyData = processAllData(
      servicesRows,
      staffScheduleRows,
      staffRows
    );

    // ✅ NEW: Get task-specific data
    globalData = {
      serviceWeeklyData: serviceWeeklyData,
      task1Data: getTask1Data(serviceWeeklyData),
      task2Data: getTask2Data(serviceWeeklyData, state.metric),
      task3Data: getTask3Data(serviceWeeklyData),
      task5Data: getTask5Data(serviceWeeklyData)
    };

    console.log("✅ Data processed:", globalData.serviceWeeklyData.length, "records");

    // Initialize views
    CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch);
    TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch);
    EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch);

    // 🆕 NEW: Initialize Task 5 (PCP)
    const pcpEl = document.getElementById("view-pcp");
    if (pcpEl) {
      console.log("  - Task 5 (PCP) initializing...");
      PCPView.init(pcpEl, globalData, state, dispatch);
    }

    // 🆕 NEW: Initialize Task 3 (Scatterplot)
    const scatterEl = document.getElementById("view-scatterplot");
    if (scatterEl) {
      console.log("  - Task 3 (Scatterplot) initializing...");
      ScatterplotView.init(scatterEl, globalData, state, dispatch);
    }

    updateAllViews();
    console.log("✅ Initialization complete!");

  } catch (error) {
    console.error("❌ Error during initialization:", error);
    document.body.innerHTML += `
      <h3 style="color:red">
        Error loading data: ${error.message}<br>
        <small>Check console (F12) for details</small>
      </h3>`;
  }
}


window.dispatch = dispatch;
window.resetState = () => dispatch({ type: "RESET" });

init();
