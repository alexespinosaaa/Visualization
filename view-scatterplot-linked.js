/**
 * TASK 3: Scatterplot Explorer - Staff Composition vs Performance
 *
 * FIXES / IMPROVEMENTS:
 * - Selection stored by STABLE ID (not array index) so it won't "select different things" after state changes
 * - Brush layer BEHIND points so hover + tooltip always work
 * - Bulletproof clear: click empty area (no-drag click), double-click, ESC
 * - No tooltip leaks: singleton tooltip, no global mousemove handlers
 * - Selected points highlight ORANGE; unselected fade
 * - Safer pointer math via d3.pointer
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const EVENT_COLORS = {
  none: "#95a5a6",
  flu: "#e74c3c",
  Other: "#f39c12",
};

const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71",
};

const SELECT_COLOR = "#ff8c00";

export function init(svgElement, globalData, state, dispatch) {
  console.log("🎨 Initializing Task 3: Scatterplot Explorer");

  svgElement._scatterState = {
    globalData,
    state,
    dispatch,
    brushSelectionIds: new Set(), // <-- stable selection
    xScale: null,
    yScale: null,
    tooltipEl: null,
    keyHandlerAttached: false,
  };

  _createScatterStructure(svgElement);
  update(svgElement, globalData, state, dispatch);
}

function _createScatterStructure(svgElement) {
  d3.select(svgElement).selectAll("*").remove();

  const wrapper = d3
    .select(svgElement)
    .append("div")
    .attr("class", "scatter-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");

  wrapper
    .append("div")
    .attr("class", "scatter-controls")
    .style("padding", "15px 20px")
    .style("background-color", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div>
        <strong style="color: #2c3e50; font-size: 14px;">Task 3: Scatterplot Explorer</strong><br>
        <span style="color: #7f8c8d; font-size: 12px;">
          Drag to select points | Click empty area to clear | Double-click to clear | ESC to clear<br>
          X: Staff Present (%) | Y: Staff Morale | Size: Refusals | Fill: Event | Stroke: Service
        </span>
      </div>
    `);

  // Massive height as requested
  wrapper
    .append("svg")
    .attr("class", "scatter-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("background-color", "#ffffff")
    .style("min-height", "800px");

  wrapper
    .append("div")
    .attr("class", "scatter-legend")
    .style("padding", "15px 20px")
    .style("background-color", "#f8f9fa")
    .style("border-top", "1px solid #e0e0e0")
    .style("font-size", "12px")
    .style("display", "grid")
    .style("grid-template-columns", "repeat(auto-fit, minmax(250px, 1fr))")
    .style("gap", "20px");
}

// Stable ID generator: use a combination that is unlikely to collide
function pointId(d) {
  // IMPORTANT: if you have a true unique ID in your dataset (e.g., d.id), use that instead.
  const p = Number.isFinite(+d.pct_staff_present) ? (+d.pct_staff_present).toFixed(2) : "na";
  const o = Number.isFinite(+d.occupancy) ? (+d.occupancy).toFixed(3) : "na";
  return `${d.week}__${d.service}__${d.event}__${p}__${d.staff_morale}__${d.patients_refused}__${o}`;
}

export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task3Data || globalData.task3Data.length === 0) {
      console.warn("⚠️ No Task 3 data available");
      return;
    }

    const data = globalData.task3Data;
    const svg = d3.select(svgElement).select("svg.scatter-chart");

    const svgNode = svg.node();
    let width = svgNode?.clientWidth || 1000;
    let height = svgNode?.clientHeight || 800;

    if (width < 100) width = 1000;
    if (height < 600) height = 800;

    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    svg.selectAll("*").remove();

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Layers (order matters): brush BEHIND points so points keep hover/mouse events
    const gridLayer = g.append("g").attr("class", "layer-grid");
    const axesLayer = g.append("g").attr("class", "layer-axes");
    const brushLayer = g.append("g").attr("class", "layer-brush"); // behind
    const pointsLayer = g.append("g").attr("class", "layer-points"); // on top

    const scatterState = svgElement._scatterState;

    // ========== SCALES ==========
    const xExtent = d3.extent(data, (d) => +d.pct_staff_present);
    const yExtent = d3.extent(data, (d) => +d.staff_morale);

    const xMin = Math.max(0, xExtent?.[0] ?? 0);
    const xMax = Math.min(100, xExtent?.[1] ?? 100);

    const yMin = Math.max(30, (yExtent?.[0] ?? 30) - 5);
    const yMax = Math.min(100, (yExtent?.[1] ?? 100) + 5);

    const xScale = d3
      .scalePow()
      .exponent(0.5)
      .domain([xMin, xMax])
      .range([0, plotWidth])
      .nice()
      .clamp(true);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([plotHeight, 0])
      .nice()
      .clamp(true);

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(data, (d) => +d.patients_refused) || 0])
      .range([5, 20]);

    const opacityScale = d3.scaleLinear().domain([60, 99]).range([0.3, 1.0]).clamp(true);

    scatterState.xScale = xScale;
    scatterState.yScale = yScale;

    // ========== FILTER FUNCTION ==========
    const passesStateFilters = (d) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;
      if (state.selectedEventType && d.event !== state.selectedEventType) return false;
      if (state.stressOnly && d.stress_level !== "high") return false;
      return true;
    };

    const hasSelection = () => scatterState.brushSelectionIds && scatterState.brushSelectionIds.size > 0;
    const isSelected = (d) => scatterState.brushSelectionIds?.has(pointId(d));

    const renderSelectionStyles = () => {
      pointsLayer
        .selectAll("circle.point")
        .style("opacity", (d) => {
          if (!passesStateFilters(d)) return 0.05;
          if (hasSelection()) return isSelected(d) ? opacityScale(+d.patient_satisfaction) : 0.08;
          return opacityScale(+d.patient_satisfaction);
        })
        .style("stroke", (d) => (hasSelection() && isSelected(d) ? SELECT_COLOR : SERVICE_COLORS[d.service] || "#95a5a6"))
        .style("stroke-width", (d) => (hasSelection() && isSelected(d) ? 3 : 2))
        .style("filter", (d) =>
          hasSelection() && isSelected(d) ? "drop-shadow(0 0 3px rgba(255, 140, 0, 0.45))" : "none"
        );
    };

    const clearSelection = () => {
      scatterState.brushSelectionIds = new Set();
      brushLayer.selectAll("rect.brush-rect").remove();
      renderSelectionStyles();
    };

    // ESC clears selection (attach once)
    if (!scatterState.keyHandlerAttached) {
      scatterState.keyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (document.body.contains(svgElement)) clearSelection();
        }
      });
    }

    // ========== AXES ==========
    const xAxis = d3.axisBottom(xScale).ticks(12).tickFormat((d) => `${d}%`);
    const yAxis = d3.axisLeft(yScale).ticks(15);

    // Grid
    gridLayer
      .append("g")
      .attr("class", "grid")
      .style("stroke", "#e8e8e8")
      .style("stroke-dasharray", "2,4")
      .style("opacity", 0.3)
      .call(d3.axisLeft(yScale).tickSize(-plotWidth).tickFormat(""));

    const xAxisGroup = axesLayer
      .append("g")
      .attr("transform", `translate(0,${plotHeight})`)
      .call(xAxis);

    xAxisGroup.selectAll("text").style("fill", "#7f8c8d").style("font-size", "11px");
    xAxisGroup.selectAll("line, path").style("stroke", "#bdc3c7").style("stroke-width", 1);

    axesLayer
      .append("text")
      .attr("x", plotWidth / 2)
      .attr("y", plotHeight + 45)
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("font-weight", "bold")
      .style("fill", "#2c3e50")
      .text("Staff Present (%)");

    const yAxisGroup = axesLayer.append("g").call(yAxis);
    yAxisGroup.selectAll("text").style("fill", "#7f8c8d").style("font-size", "11px");
    yAxisGroup.selectAll("line, path").style("stroke", "#bdc3c7").style("stroke-width", 1);

    axesLayer
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -plotHeight / 2)
      .attr("y", -55)
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("font-weight", "bold")
      .style("fill", "#2c3e50")
      .text("Staff Morale");

    // ========== TOOLTIP (singleton, no leaks) ==========
    const getTooltip = () => {
      if (scatterState.tooltipEl && document.body.contains(scatterState.tooltipEl.node())) return scatterState.tooltipEl;

      scatterState.tooltipEl = d3
        .select("body")
        .append("div")
        .attr("class", "scatter-tooltip")
        .style("position", "fixed")
        .style("background-color", "#2c3e50")
        .style("color", "white")
        .style("padding", "12px 15px")
        .style("border-radius", "6px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("z-index", "1000")
        .style("max-width", "350px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.2)")
        .style("display", "none");

      return scatterState.tooltipEl;
    };

    const showTooltip = (event, d) => {
      const tooltip = getTooltip();
      tooltip
        .html(`
          <strong style="font-size: 13px;">${d.service}</strong> - Week ${d.week}<br>
          <span style="color: #bdc3c7; display: block; margin-top: 5px;">
            Event: ${d.event === "none" ? "Normal" : d.event}<br>
            Staff Present: <strong>${(+d.pct_staff_present).toFixed(1)}%</strong> | Morale: <strong>${d.staff_morale}</strong><br>
            Patients Refused: <strong>${d.patients_refused}</strong> | Occupancy: <strong>${(+d.occupancy * 100).toFixed(1)}%</strong><br>
            Patient Satisfaction: <strong>${d.patient_satisfaction}</strong>
          </span><br>
          <span style="color: #f39c12; display: block; margin-top: 5px;">
            Stress Level: <strong>${d.stress_level}</strong>
          </span>
        `)
        .style("display", "block");

      const x = event?.pageX ?? event?.clientX ?? 0;
      const y = event?.pageY ?? event?.clientY ?? 0;
      tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
    };

    const moveTooltip = (event) => {
      const tooltip = scatterState.tooltipEl;
      if (!tooltip || tooltip.style("display") === "none") return;
      const x = event?.pageX ?? event?.clientX ?? 0;
      const y = event?.pageY ?? event?.clientY ?? 0;
      tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
    };

    const hideTooltip = () => {
      if (scatterState.tooltipEl) scatterState.tooltipEl.style("display", "none");
    };

    // ========== POINTS ==========
    pointsLayer
      .selectAll("circle.point")
      .data(data, (d) => pointId(d))
      .join("circle")
      .attr("class", "point")
      .attr("cx", (d) => xScale(+d.pct_staff_present))
      .attr("cy", (d) => yScale(+d.staff_morale))
      .attr("r", (d) => sizeScale(+d.patients_refused))
      .style("fill", (d) => EVENT_COLORS[d.event] || EVENT_COLORS.none)
      .style("cursor", "default")
      .on("mouseenter", function (event, d) {
        d3.select(this).style("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.35))");
        showTooltip(event, d);
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseleave", function () {
        // restore selection style filter (if selected) via renderSelectionStyles()
        d3.select(this).style("filter", "none");
        hideTooltip();
        renderSelectionStyles();
      });

    // Apply styles after join
    renderSelectionStyles();

    // Hide tooltip if leaving the SVG quickly
    svg.on("mouseleave", hideTooltip);

    // ========== BRUSH (robust + clear behavior) ==========
    const brushState = { start: null, moved: false };

    const brushBg = brushLayer
      .append("rect")
      .attr("class", "brush-background")
      .attr("width", plotWidth)
      .attr("height", plotHeight)
      .style("fill", "transparent")
      .style("cursor", "crosshair");

    // Clear on click if user did NOT actually drag (simple 3px threshold)
    brushBg.on("click", () => {
      if (!brushState.moved) clearSelection();
    });

    brushBg.on("dblclick", () => clearSelection());

    brushBg.call(
      d3
        .drag()
        .on("start", (event) => {
          brushState.start = d3.pointer(event, g.node());
          brushState.moved = false;
          brushLayer.selectAll("rect.brush-rect").remove();
        })
        .on("drag", (event) => {
          const p = d3.pointer(event, g.node());
          const dx = p[0] - brushState.start[0];
          const dy = p[1] - brushState.start[1];
          if (dx * dx + dy * dy > 9) brushState.moved = true; // >3px movement

          const x0 = Math.max(0, Math.min(brushState.start[0], p[0]));
          const x1 = Math.min(plotWidth, Math.max(brushState.start[0], p[0]));
          const y0 = Math.max(0, Math.min(brushState.start[1], p[1]));
          const y1 = Math.min(plotHeight, Math.max(brushState.start[1], p[1]));

          brushLayer.selectAll("rect.brush-rect").remove();
          brushLayer
            .append("rect")
            .attr("class", "brush-rect")
            .attr("x", x0)
            .attr("y", y0)
            .attr("width", x1 - x0)
            .attr("height", y1 - y0)
            .style("fill", SELECT_COLOR)
            .style("fill-opacity", 0.15)
            .style("stroke", SELECT_COLOR)
            .style("stroke-width", 2);

          // Compute selected IDs
          const selectedIds = new Set();
          for (const d of data) {
            const cx = xScale(+d.pct_staff_present);
            const cy = yScale(+d.staff_morale);
            if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
              selectedIds.add(pointId(d));
            }
          }

          scatterState.brushSelectionIds = selectedIds;
          renderSelectionStyles();
        })
        .on("end", () => {
          // Remove rectangle (you can keep it if you want persistent visual box)
          brushLayer.selectAll("rect.brush-rect").remove();

          // If there is a selection, dispatch linked filter
          if (hasSelection()) {
            const selectedWeeks = new Set();
            for (const d of data) {
              if (scatterState.brushSelectionIds.has(pointId(d))) selectedWeeks.add(d.week);
            }
            const weekArray = Array.from(selectedWeeks).sort((a, b) => a - b);
            if (weekArray.length > 0) {
              dispatch({
                type: "SET_TIME_RANGE",
                value: [weekArray[0], weekArray[weekArray.length - 1]],
              });
            }
          }
        })
    );

    _updateScatterLegend(svgElement);
  } catch (error) {
    console.error("❌ Error in Scatter update:", error);
  }
}

function _updateScatterLegend(svgElement) {
  const legendDiv = d3.select(svgElement).select(".scatter-legend");
  legendDiv.selectAll("*").remove();

  const eventHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Event Type (Fill Color)</strong>
      ${Object.entries(EVENT_COLORS)
        .map(
          ([event, color]) => `
        <div style="display: flex; align-items: center; margin: 6px 0;">
          <span style="
            display: inline-block;
            width: 12px;
            height: 12px;
            background-color: ${color};
            border-radius: 50%;
            margin-right: 8px;
            border: 1px solid #ccc;
          "></span>
          <span style="font-size: 11px; color: #2c3e50;">${event === "none" ? "Normal" : event}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  const serviceHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Service Type (Border Color)</strong>
      ${Object.entries(SERVICE_COLORS)
        .map(
          ([service, color]) => `
        <div style="display: flex; align-items: center; margin: 6px 0;">
          <span style="
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid ${color};
            border-radius: 50%;
            background-color: white;
            margin-right: 8px;
          "></span>
          <span style="font-size: 11px; color: #2c3e50;">${service.replaceAll("_", " ")}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  const sizeHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Bubble Size</strong>
      <span style="font-size: 11px; color: #7f8c8d;">
        Size = Patients Refused (0-363)<br>
        Larger bubbles = More demand pressure
      </span>
    </div>
  `;

  const opacityHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Opacity</strong>
      <span style="font-size: 11px; color: #7f8c8d;">
        Opacity = Patient Satisfaction (60-99)<br>
        More opaque = Higher satisfaction
      </span>
    </div>
  `;

  const selectionHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Selection</strong>
      <span style="font-size: 11px; color: #7f8c8d;">
        Selected points get an <span style="color:${SELECT_COLOR}; font-weight:700;">orange</span> outline<br>
        Unselected points fade
      </span>
    </div>
  `;

  legendDiv.html(eventHtml + serviceHtml + sizeHtml + opacityHtml + selectionHtml);
}
