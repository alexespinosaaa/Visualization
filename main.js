// main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { processDataForTask1 } from "./data_processor_A.js";
import * as CalendarView from "./view-calendar.js";
import * as TimeSeriesView from "./view-timeseries.js";

// GLOBAL STATE
let state = {
    selectedWeek: null,
    timeRange: null,        // For Brush [WeekStart, WeekEnd]
    zoomTransform: null,    // For Geometric Zoom
    metric: "refusals", 
    selectedEventType: null
};

// Use the Relative Path logic we fixed earlier
const CSV_PATH = "../JBI100%20Data%20(2025-2026)/Hospital%20Beds%20Management/services_weekly.csv";

// DISPATCHER
function dispatch(action) {
    // console.log("Action:", action); // Uncomment for debugging

    switch (action.type) {
        case "SET_SELECTED_WEEK":
            state.selectedWeek = (state.selectedWeek === action.value) ? null : action.value;
            break;
        case "SET_TIME_RANGE":
            // Brush updates
            state.timeRange = action.value;
            break;
        case "SET_ZOOM":
            // Geometric Zoom updates
            state.zoomTransform = action.value;
            break;
        case "SET_METRIC":
            state.metric = action.value;
            break;
        case "SET_SELECTED_EVENT_TYPE":
            state.selectedEventType = (state.selectedEventType === action.value) ? null : action.value;
            break;
        case "RESET":
            state.selectedWeek = null;
            state.timeRange = null;
            state.selectedEventType = null;
            state.zoomTransform = null;
            break;
    }
    updateAllViews();
}

let globalData = {};

function updateAllViews() {
    const calendarContainer = document.getElementById("view-calendar");
    const seriesContainer = document.getElementById("view-timeseries");

    // Pass the raw globalData, state, and dispatch function
    CalendarView.update(calendarContainer, globalData, state);
    TimeSeriesView.update(seriesContainer, globalData, state);
}

// INITIALIZATION
async function init() {
    try {
        const rawData = await d3.csv(CSV_PATH);
        const processedA = processDataForTask1(rawData);
        
        globalData = { hospitalWeekly: processedA };

        CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch);
        TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch);
        
        updateAllViews();
    } catch (error) {
        console.error("Error:", error);
        document.body.innerHTML += `<h3 style='color:red'>Error loading data.<br>Ensure you are running the server from the 'VIS' folder.</h3>`;
    }
}

window.dispatch = dispatch;
window.resetState = () => dispatch({ type: "RESET" });

init();