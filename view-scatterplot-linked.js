/**
 * TASK 3: Scatterplot Explorer - Staff Composition vs Performance
 * 
 * Visualization: 6D scatterplot with linked brushing
 * 
 * Axes:
 * - X-axis: pct_staff_present [0-100%] - Staff presence rate
 * - Y-axis: staff_morale [31-99] - Staff satisfaction
 * 
 * Encoding:
 * - Point color: event type (none/flu/Other)
 * - Point size: patients_refused (0-363) - Demand pressure
 * - Point opacity: patient_satisfaction (60-99) - Normalized
 * - Point border: service type (4 different colors)
 * 
 * Interaction:
 * - Rectangle brush to select points
 * - Selected points highlight in orange, unselected fade
 * - Hover for tooltip with full details
 * - "Clear Brush" button to reset selection
 * 
 * FIXED: Added state reads, dispatch calls, and coordinated linkage
 */


import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";


const EVENT_COLORS = {
  none: "#95a5a6",
  flu: "#e74c3c",
  Other: "#f39c12"
};


const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71"
};


export function init(svgElement, globalData, state, dispatch) {
  console.log("🎨 Initializing Task 3: Scatterplot Explorer");
  
  svgElement._scatterState = {
    globalData,
    state,
    dispatch,
    brushSelection: null,
    xScale: null,
    yScale: null
  };


  _createScatterStructure(svgElement);
  update(svgElement, globalData, state, dispatch);
}


function _createScatterStructure(svgElement) {
  d3.select(svgElement).selectAll("*").remove();


  const wrapper = d3.select(svgElement).append("div")
    .attr("class", "scatter-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");


  wrapper.append("div")
    .attr("class", "scatter-controls")
    .style("padding", "15px")
    .style("background-color", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div style="display: flex; gap: 20px; align-items: center;">
        <div>
          <strong style="color: #2c3e50;">Task 3: Scatterplot Explorer</strong><br>
          <span style="color: #7f8c8d; font-size: 12px;">
            Drag to select points. X = Staff Present (%) | Y = Staff Morale | Size = Refusals | Color = Event Type
          </span>
        </div>
        <button id="scatter-reset-brush" style="
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
    .attr("class", "scatter-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("min-height", "500px");


  wrapper.append("div")
    .attr("class", "scatter-legend")
    .style("padding", "15px")
    .style("background-color", "#ffffff")
    .style("border-top", "1px solid #e0e0e0")
    .style("font-size", "12px")
    .style("display", "flex")
    .style("gap", "40px");
}


export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task3Data || globalData.task3Data.length === 0) {
      console.warn("⚠️ No Task 3 data available");
      return;
    }


    const data = globalData.task3Data;
    const svg = d3.select(svgElement).select("svg.scatter-chart");


    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const width = svg.node().clientWidth - margin.left - margin.right;
    const height = Math.max(500, svg.node().clientHeight - margin.top - margin.bottom);


    svg.selectAll("*").remove();


    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);


    // ========== SCALES ==========
    const xScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, width]);


    const yScale = d3.scaleLinear()
      .domain([30, 100])
      .range([height, 0]);


    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(data, d => +d.patients_refused)])
      .range([3, 15]);


    const opacityScale = d3.scaleLinear()
      .domain([60, 99])
      .range([0.3, 1.0]);


    // Store scales for brush interaction
    svgElement._scatterState.xScale = xScale;
    svgElement._scatterState.yScale = yScale;


    // ========== AXES ==========
    const xAxis = d3.axisBottom(xScale).ticks(10);
    const yAxis = d3.axisLeft(yScale).ticks(10);


    // X-axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis)
      .style("color", "#7f8c8d");


    g.append("text")
      .attr("transform", `translate(${width / 2},${height + 40})`)
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("font-weight", "bold")
      .style("color", "#2c3e50")
      .text("Staff Present (%)");


    // Y-axis
    g.append("g")
      .call(yAxis)
      .style("color", "#7f8c8d");


    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -50)
      .attr("x", -(height / 2))
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("font-weight", "bold")
      .style("color", "#2c3e50")
      .text("Staff Morale");


    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .style("stroke", "#ecf0f1")
      .style("stroke-dasharray", "4")
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat("")
      );


    // ========== FILTER FUNCTION (NEW) ==========
    // 🔧 FIX: Filter points based on global state
    const passesStateFilters = (d, index) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;
      if (state.selectedEventType && d.event !== state.selectedEventType) return false;
      if (state.stressOnly && d.stress_level !== 'high') return false;
      return true;
    };


    // ========== CIRCLES (with brush state + global state) ==========
    const scatterState = svgElement._scatterState;
    const brushSelection = scatterState.brushSelection;


    const circles = g.selectAll(".point")
      .data(data, (d, i) => i)
      .enter()
      .append("circle")
      .attr("class", "point")
      .attr("cx", d => xScale(+d.pct_staff_present))
      .attr("cy", d => yScale(+d.staff_morale))
      .attr("r", d => sizeScale(+d.patients_refused))
      .style("fill", d => EVENT_COLORS[d.event] || "#95a5a6")
      .style("stroke", d => SERVICE_COLORS[d.service] || "#95a5a6")
      .style("stroke-width", 2)
      .style("opacity", (d, i) => {
        // 🔧 FIX: Check state filters FIRST
        if (!passesStateFilters(d, i)) return 0.1;
        
        // Then check local brush selection
        if (brushSelection && brushSelection.length > 0) {
          const isSelected = brushSelection.includes(i);
          if (!isSelected) return 0.1;
        }
        
        return opacityScale(+d.patient_satisfaction);
      })
      .on("mouseover", function(event, d) {
        d3.select(this)
          .style("stroke-width", 3)
          .style("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.4))");


        _showScatterTooltip(event, d);
      })
      .on("mouseout", function() {
        d3.select(this)
          .style("stroke-width", 2)
          .style("filter", "none");


        _hideScatterTooltip();
      });


    // ========== RECTANGLE BRUSH ==========
    const brushSelection2 = { start: null, end: null, active: false };


    g.append("rect")
      .attr("class", "brush-background")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "transparent")
      .style("cursor", "crosshair")
      .call(
        d3.drag()
          .on("start", function(event) {
            brushSelection2.active = true;
            brushSelection2.start = { x: event.x, y: event.y };
          })
          .on("drag", function(event) {
            brushSelection2.end = { x: event.x, y: event.y };


            // Draw brush rect
            const x0 = Math.min(brushSelection2.start.x, brushSelection2.end.x);
            const x1 = Math.max(brushSelection2.start.x, brushSelection2.end.x);
            const y0 = Math.min(brushSelection2.start.y, brushSelection2.end.y);
            const y1 = Math.max(brushSelection2.start.y, brushSelection2.end.y);


            g.selectAll(".brush-rect").remove();
            g.append("rect")
              .attr("class", "brush-rect")
              .attr("x", x0)
              .attr("y", y0)
              .attr("width", x1 - x0)
              .attr("height", y1 - y0)
              .style("fill", "#3498db")
              .style("fill-opacity", 0.2)
              .style("stroke", "#3498db")
              .style("stroke-width", 2);


            // Select points in brush
            const selectedIndices = [];
            data.forEach((d, i) => {
              const cx = xScale(+d.pct_staff_present);
              const cy = yScale(+d.staff_morale);
              if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
                selectedIndices.push(i);
              }
            });


            scatterState.brushSelection = selectedIndices;


            // Update circles
            g.selectAll(".point")
              .style("opacity", (d, i) => {
                // 🔧 FIX: Check state filters FIRST
                if (!passesStateFilters(d, i)) return 0.1;
                
                // Then local brush
                const isSelected = selectedIndices.includes(i);
                if (!isSelected) return 0.1;
                return opacityScale(+d.patient_satisfaction);
              })
              .style("stroke-width", (d, i) => {
                const isSelected = selectedIndices.includes(i);
                return isSelected ? 3 : 2;
              })
              .style("filter", (d, i) => {
                const isSelected = selectedIndices.includes(i);
                return isSelected ? "drop-shadow(0 0 3px rgba(52, 152, 219, 0.5))" : "none";
              });
          })
          .on("end", function(event) {
            brushSelection2.active = false;
            g.selectAll(".brush-rect").remove();


            // 🔧 FIX: DISPATCH to global state when brush ends
            if (scatterState.brushSelection && scatterState.brushSelection.length > 0) {
              const weeks = new Set();
              scatterState.brushSelection.forEach(i => weeks.add(data[i].week));
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


    // ========== LEGEND ==========
    _updateScatterLegend(svgElement);


    // ========== RESET BUTTON ==========
    d3.select(svgElement).select("#scatter-reset-brush")
      .on("click", function() {
        scatterState.brushSelection = null;


        // 🔧 FIX: Update points based on state filters (not just brushSelection)
        g.selectAll(".point")
          .style("opacity", (d, i) => {
            if (!passesStateFilters(d, i)) return 0.1;
            return opacityScale(+d.patient_satisfaction);
          })
          .style("stroke-width", 2)
          .style("filter", "none");


        g.selectAll(".brush-rect").remove();


        console.log("🔄 Scatter Brush cleared");
      });


  } catch (error) {
    console.error("❌ Error in Scatter update:", error);
  }
}


function _showScatterTooltip(event, d) {
  const tooltip = d3.select("body").append("div")
    .attr("class", "scatter-tooltip")
    .style("position", "fixed")
    .style("background-color", "#2c3e50")
    .style("color", "white")
    .style("padding", "12px 15px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000")
    .style("max-width", "350px")
    .html(`
      <strong>${d.service}</strong> - Week ${d.week}<br>
      <span style="color: #bdc3c7;">
        Event: ${d.event === 'none' ? 'Normal' : d.event}<br>
        Staff Present: ${d.pct_staff_present.toFixed(1)}% | Morale: ${d.staff_morale}<br>
        Patients Refused: ${d.patients_refused} | Occupancy: ${(d.occupancy * 100).toFixed(1)}%<br>
        Patient Satisfaction: ${d.patient_satisfaction}
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


function _hideScatterTooltip() {
  d3.selectAll(".scatter-tooltip").remove();
  d3.select("body").on("mousemove", null);
}


function _updateScatterLegend(svgElement) {
  const legendDiv = d3.select(svgElement).select(".scatter-legend");
  legendDiv.selectAll("*").remove();


  // Event colors
  const eventHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 8px;">Event Type (Fill Color):</strong>
      ${Object.entries(EVENT_COLORS).map(([event, color]) => `
        <div style="display: flex; align-items: center; margin: 5px 0; font-size: 11px;">
          <span style="
            display: inline-block;
            width: 14px;
            height: 14px;
            background-color: ${color};
            border-radius: 50%;
            margin-right: 8px;
          "></span>
          ${event === 'none' ? 'Normal' : event}
        </div>
      `).join("")}
    </div>
  `;


  // Service colors
  const serviceHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 8px;">Service (Border Color):</strong>
      ${Object.entries(SERVICE_COLORS).map(([service, color]) => `
        <div style="display: flex; align-items: center; margin: 5px 0; font-size: 11px;">
          <span style="
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid ${color};
            border-radius: 50%;
            background-color: white;
            margin-right: 8px;
          "></span>
          ${service}
        </div>
      `).join("")}
    </div>
  `;


  // Size explanation
  const sizeHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 8px;">Size = Patients Refused</strong>
      <div style="font-size: 11px; color: #7f8c8d;">
        Larger circles = More refusals
      </div>
    </div>
  `;


  // Opacity explanation
  const opacityHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 8px;">Opacity = Patient Satisfaction</strong>
      <div style="font-size: 11px; color: #7f8c8d;">
        More opaque = Higher satisfaction
      </div>
    </div>
  `;


  legendDiv.html(eventHtml + serviceHtml + sizeHtml + opacityHtml);
}
