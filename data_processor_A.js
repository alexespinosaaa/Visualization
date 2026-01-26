// src/data_processor_A.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function processDataForTask1(csvData) {
    // 1. Group by Week
    const weeklyData = d3.flatRollup(csvData, (v) => {
        return {
            refusals: d3.sum(v, d => +d.patients_refused),
            morale: d3.mean(v, d => +d.staff_morale),
            // Find dominant event (ignore 'none' if others exist)
            eventType: v.map(d => d.event).find(e => e !== 'none') || 'none',
            // Aggregated occupancy (admitted / beds) - approximation
            occupancy: d3.sum(v, d => +d.patients_admitted) / d3.sum(v, d => +d.available_beds)
        };
    }, d => +d.week);

    // 2. Format for D3
    return weeklyData.map(([week, metrics]) => ({
        week: week,
        // Approximate month mapping (1-52 -> 1-12)
        month: Math.ceil(week / 4.33), 
        ...metrics
    })).sort((a, b) => a.week - b.week);
}