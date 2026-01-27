// main.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { processDataForTask1 } from "./data_processor_A.js";
import { processDataForTask2and5 } from "./data_processor_B.js";

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
}

// INITIALIZATION
async function init() {
    try {
        const rawData = await d3.csv(CSV_PATH);

        globalData = {
            hospitalWeekly: processDataForTask1(rawData),
            serviceWeekly: processDataForTask2and5(rawData)
        };

        CalendarView.init(document.getElementById("view-calendar"), globalData, state, dispatch);
        TimeSeriesView.init(document.getElementById("view-timeseries"), globalData, state, dispatch);
        EventImpactView.init(document.getElementById("view-events"), globalData, state, dispatch);
        TableView.init(document.getElementById("view-table"), globalData, state, dispatch);

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
