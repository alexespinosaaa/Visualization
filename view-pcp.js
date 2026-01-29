/**
 * TASK 5: Parallel Coordinate Plot (PCP)
 * 
 * Visualization: 5-axis parallel coordinate plot showing multivariate relationships
 * 
 * Axes (5):
 * 1. Week [1-52] - Temporal dimension
 * 2. Available Beds [8-74] - Capacity
 * 3. Patients Refused [0-363] - Demand overflow
 * 4. Staff Morale [31-99] - Staff outcomes
 * 5. Patient Satisfaction [60-99] - Patient outcomes
 * 
 * Encoding:
 * - Line color: Service type (Emergency, ICU, Surgery, General_Medicine)
 * - Line opacity: Stress level (low=0.2, moderate=0.5, high=1.0)
 * - Brush interaction: Select polylines → highlight in other views
 * 
 * FIXED: Added state reads, dispatch calls, and coordinated linkage
 */


import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";


const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71"
};


const STRESS_OPACITY = {
  low: 0.2,
  moderate: 0.5,
  high: 1.0
};


export function init(svgElement, globalData, state, dispatch) {
  console.log("🎨 Initializing Task 5: Parallel Coordinate Plot");
  
  svgElement._pcpState = {
    globalData,
    state,
    dispatch,
    brushSelection: null
  };


  _createPCPStructure(svgElement);
  update(svgElement, globalData, state, dispatch);
}


function _createPCPStructure(svgElement) {
  d3.select(svgElement).selectAll("*").remove();


  const wrapper = d3.select(svgElement).append("div")
    .attr("class", "pcp-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");


  wrapper.append("div")
    .attr("class", "pcp-controls")
    .style("padding", "15px")
    .style("background-color", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div style="display: flex; gap: 20px; align-items: center;">
        <div>
          <strong style="color: #2c3e50;">Task 5: Parallel Coordinate Plot</strong><br>
          <span style="color: #7f8c8d; font-size: 12px;">
            Drag on any axis to filter. Colors = Services. Opacity = Stress Level.
          </span>
        </div>
        <button id="pcp-reset-brush" style="
          padding: 8px 16px;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">Clear Brush</button>
      </div>
    `);


  wrapper.append("svg")
    .attr("class", "pcp-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("min-height", "500px");


  wrapper.append("div")
    .attr("class", "pcp-legend")
    .style("padding", "15px")
    .style("background-color", "#ffffff")
    .style("border-top", "1px solid #e0e0e0")
    .style("font-size", "12px");
}


export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task5Data || globalData.task5Data.length === 0) {
      console.warn("⚠️ No Task 5 data available");
      return;
    }


    const data = globalData.task5Data;
    const svg = d3.select(svgElement).select("svg.pcp-chart");


    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = svg.node().clientWidth - margin.left - margin.right;
    const height = Math.max(500, svg.node().clientHeight - margin.top - margin.bottom);


    svg.selectAll("*").remove();


    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);


    // Define axes
    const axes = [
      { key: "week", label: "Week", range: [1, 52] },
      { key: "available_beds", label: "Available Beds", range: [8, 74] },
      { key: "patients_refused", label: "Patients Refused", range: [0, 363] },
      { key: "staff_morale", label: "Staff Morale", range: [31, 99] },
      { key: "patient_satisfaction", label: "Patient Satisfaction", range: [60, 99] }
    ];


    // Create scales
    const scales = {};
    axes.forEach(axis => {
      const extent = d3.extent(data, d => +d[axis.key]);
      scales[axis.key] = d3.scaleLinear()
        .domain(extent)
        .range([height, 0]);
    });


    // Axis positions
    const axisPositions = d3.scalePoint()
      .domain(axes.map(d => d.key))
      .range([0, width]);


    // Draw axes
    const axisGroups = g.selectAll(".axis-group")
      .data(axes)
      .enter()
      .append("g")
      .attr("class", "axis-group")
      .attr("transform", d => `translate(${axisPositions(d.key)},0)`);


    axisGroups.append("line")
      .attr("class", "axis-line")
      .attr("y1", 0)
      .attr("y2", height)
      .style("stroke", "#bdc3c7")
      .style("stroke-width", 2);


    axisGroups.append("text")
      .attr("class", "axis-label")
      .attr("y", -15)
      .attr("text-anchor", "middle")
      .style("font-weight", "bold")
      .style("color", "#2c3e50")
      .style("font-size", "12px")
      .text(d => d.label);


    // Ticks
    axisGroups.append("g")
      .attr("class", "axis-ticks")
      .each(function(axis) {
        const scale = scales[axis.key];
        const tickValues = scale.ticks(5);


        d3.select(this).selectAll("g.tick")
          .data(tickValues)
          .enter()
          .append("g")
          .attr("class", "tick")
          .attr("transform", d => `translate(0,${scale(d)})`)
          .append("line")
          .attr("x2", -6)
          .style("stroke", "#bdc3c7")
          .style("stroke-width", 1);


        d3.select(this).selectAll("text.tick-label")
          .data(tickValues)
          .enter()
          .append("text")
          .attr("class", "tick-label")
          .attr("y", d => scale(d))
          .attr("x", -10)
          .attr("text-anchor", "end")
          .attr("dy", "0.32em")
          .style("font-size", "10px")
          .style("fill", "#7f8c8d")
          .text(d => d.toFixed(0));
      });


    // 🔧 FIX: Filter function for state constraints
    const passesStateFilters = (d, index) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;
      if (state.selectedEventType && d.event !== state.selectedEventType) return false;
      if (state.stressOnly && d.stress_level !== 'high') return false;
      return true;
    };


    // Draw polylines
    const pcpState = svgElement._pcpState;
    const brushSelection = pcpState.brushSelection;


    g.selectAll(".polyline")
      .data(data, (d, i) => i)
      .enter()
      .append("polyline")
      .attr("class", "polyline")
      .attr("points", d => {
        return axes.map(axis => [
          axisPositions(axis.key),
          scales[axis.key](+d[axis.key])
        ]).join(" ");
      })
      .style("fill", "none")
      .style("stroke", d => SERVICE_COLORS[d.service] || "#95a5a6")
      .style("stroke-width", (d, i) => {
        // 🔧 FIX: Check state filters FIRST
        if (!passesStateFilters(d, i)) return 1;
        
        if (brushSelection && brushSelection.length > 0) {
          const isSelected = brushSelection.includes(i);
          return isSelected ? 2.5 : 1;
        }
        return 1.5;
      })
      .style("opacity", (d, i) => {
        // 🔧 FIX: Check state filters FIRST
        if (!passesStateFilters(d, i)) return 0.05;
        
        if (brushSelection && brushSelection.length > 0) {
          const isSelected = brushSelection.includes(i);
          if (!isSelected) return 0.1;
        }
        return STRESS_OPACITY[d.stress_level] || 0.5;
      })
      .on("mouseover", function(event, d) {
        d3.select(this)
          .style("stroke-width", 3)
          .style("filter", "drop-shadow(0 0 3px rgba(0,0,0,0.3))");


        _showPCPTooltip(event, d);
      })
      .on("mouseout", function(event, d) {
        d3.select(this)
          .style("stroke-width", (d, i) => {
            if (!passesStateFilters(d, i)) return 1;
            
            if (brushSelection && brushSelection.length > 0) {
              const isSelected = brushSelection.includes(data.indexOf(d));
              return isSelected ? 2.5 : 1;
            }
            return 1.5;
          })
          .style("filter", "none");


        _hidePCPTooltip();
      });


    // Brush interaction
    const draggedAxis = { key: null };


    axisGroups.append("g")
      .attr("class", "brush-target")
      .append("rect")
      .attr("width", 50)
      .attr("x", -25)
      .attr("y", 0)
      .attr("height", height)
      .style("fill", "transparent")
      .style("cursor", "crosshair")
      .call(
        d3.drag()
          .on("start", function(event) {
            draggedAxis.key = d3.select(this.parentNode.parentNode).datum().key;
            draggedAxis.y0 = event.y;
            draggedAxis.brushExtent = [event.y, event.y];
          })
          .on("drag", function(event) {
            draggedAxis.brushExtent = [
              Math.min(draggedAxis.y0, event.y),
              Math.max(draggedAxis.y0, event.y)
            ];


            _drawBrushRect(g, draggedAxis, axisPositions);


            const selectedIndices = _getSelectedIndices(
              data,
              draggedAxis,
              scales
            );


            pcpState.brushSelection = selectedIndices;


            g.selectAll(".polyline")
              .style("stroke-width", (d, i) => {
                if (!passesStateFilters(d, i)) return 1;
                
                const isSelected = selectedIndices.includes(i);
                return isSelected ? 2.5 : 1;
              })
              .style("opacity", (d, i) => {
                if (!passesStateFilters(d, i)) return 0.05;
                
                const isSelected = selectedIndices.includes(i);
                if (!isSelected) return 0.1;
                return STRESS_OPACITY[d.stress_level] || 0.5;
              });
          })
          .on("end", function(event) {
            g.selectAll(".brush-rect").remove();


            // 🔧 FIX: DISPATCH to global state when brush ends
            if (pcpState.brushSelection && pcpState.brushSelection.length > 0) {
              const weeks = new Set();
              pcpState.brushSelection.forEach(i => weeks.add(data[i].week));
              const weekArray = Array.from(weeks).sort((a, b) => a - b);
              if (weekArray.length > 0) {
                dispatch({ 
                  type: "SET_TIME_RANGE", 
                  value: [weekArray[0], weekArray[weekArray.length - 1]] 
                });
              }
            }
          })
      );


    _updatePCPLegend(svgElement);


    d3.select(svgElement).select("#pcp-reset-brush")
      .on("click", function() {
        pcpState.brushSelection = null;


        // 🔧 FIX: Update polylines based on state filters
        g.selectAll(".polyline")
          .style("stroke-width", (d, i) => {
            if (!passesStateFilters(d, i)) return 1;
            return 1.5;
          })
          .style("opacity", (d, i) => {
            if (!passesStateFilters(d, i)) return 0.05;
            return STRESS_OPACITY[d.stress_level] || 0.5;
          });


        g.selectAll(".brush-rect").remove();


        console.log("🔄 PCP Brush cleared");
      });


  } catch (error) {
    console.error("❌ Error in PCP update:", error);
  }
}


function _drawBrushRect(g, draggedAxis, axisPositions) {
  g.selectAll(".brush-rect").remove();


  const axisPos = axisPositions(draggedAxis.key);
  const y0 = draggedAxis.brushExtent[0];
  const y1 = draggedAxis.brushExtent[1];


  g.append("rect")
    .attr("class", "brush-rect")
    .attr("x", axisPos - 25)
    .attr("y", y0)
    .attr("width", 50)
    .attr("height", y1 - y0)
    .style("fill", "#3498db")
    .style("fill-opacity", 0.3)
    .style("pointer-events", "none");
}


function _getSelectedIndices(data, draggedAxis, scales) {
  const scale = scales[draggedAxis.key];
  const y0 = draggedAxis.brushExtent[0];
  const y1 = draggedAxis.brushExtent[1];


  const value0 = scale.invert(Math.max(y0, y1));
  const value1 = scale.invert(Math.min(y0, y1));


  return data
    .map((d, i) => {
      const val = +d[draggedAxis.key];
      if (val >= value1 && val <= value0) return i;
      return null;
    })
    .filter(i => i !== null);
}


function _showPCPTooltip(event, d) {
  const tooltip = d3.select("body").append("div")
    .attr("class", "pcp-tooltip")
    .style("position", "fixed")
    .style("background-color", "#2c3e50")
    .style("color", "white")
    .style("padding", "10px 15px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000")
    .html(`
      <strong>${d.service}</strong> (Week ${d.week})<br>
      <span style="color: #bdc3c7;">
        Beds: ${d.available_beds} | Refused: ${d.patients_refused}<br>
        Morale: ${d.staff_morale} | Satisfaction: ${d.patient_satisfaction}
      </span><br>
      <span style="color: #f39c12;">Stress: ${d.stress_level}</span>
    `)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");


  d3.select("body").on("mousemove", function(moveEvent) {
    tooltip
      .style("left", (moveEvent.pageX + 10) + "px")
      .style("top", (moveEvent.pageY + 10) + "px");
  });
}


function _hidePCPTooltip() {
  d3.selectAll(".pcp-tooltip").remove();
  d3.select("body").on("mousemove", null);
}


function _updatePCPLegend(svgElement) {
  const legendDiv = d3.select(svgElement).select(".pcp-legend");
  legendDiv.selectAll("*").remove();


  const serviceHtml = `
    <div style="margin-bottom: 15px;">
      <strong style="color: #2c3e50;">Services (Colors):</strong><br>
      ${Object.entries(SERVICE_COLORS).map(([service, color]) => `
        <span style="display: inline-block; margin-right: 20px; margin-top: 5px;">
          <span style="
            display: inline-block;
            width: 12px;
            height: 12px;
            background-color: ${color};
            border-radius: 2px;
            margin-right: 5px;
            vertical-align: middle;
          "></span>
          <span style="font-size: 11px;">${service}</span>
        </span>
      `).join("")}
    </div>
  `;


  const stressHtml = `
    <div>
      <strong style="color: #2c3e50;">Stress Level (Opacity):</strong><br>
      ${Object.entries(STRESS_OPACITY).map(([level, opacity]) => `
        <span style="display: inline-block; margin-right: 20px; margin-top: 5px;">
          <span style="
            display: inline-block;
            width: 12px;
            height: 2px;
            background-color: #2c3e50;
            opacity: ${opacity};
            margin-right: 5px;
            vertical-align: middle;
          "></span>
          <span style="font-size: 11px;">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
        </span>
      `).join("")}
    </div>
  `;


  legendDiv.html(serviceHtml + stressHtml);
}
