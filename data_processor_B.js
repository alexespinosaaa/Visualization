// data_processor_B.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function processDataForTask2and5(csvData) {
  return csvData.map(d => {
    const week = +d.week;
    const available_beds = +d.available_beds;
    const admitted = +d.patients_admitted;

    return {
      week,
      month: +d.month,
      service: d.service,
      eventType: (d.event && d.event.trim()) ? d.event.trim() : "none",

      refusals: +d.patients_refused,
      morale: +d.staff_morale,
      satisfaction: +d.patient_satisfaction,
      occupancy: available_beds > 0 ? admitted / available_beds : 0,

      available_beds,
      patients_request: +d.patients_request,
      patients_admitted: admitted
    };
  });
}
