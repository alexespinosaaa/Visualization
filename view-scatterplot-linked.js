/**
 * TASK 3: Scatterplot Explorer - Staff Composition vs Performance
 *
 * ✅ NEW:
 * - Interactive Service legend (toggle / solo / reset)
 *   - Click service = toggle on/off (multi-select)
 *   - Shift+Click service = solo that service
 *   - Double-click service legend header = reset (show all)
 *   - Inactive services dim in legend + points hidden
 *
 * ✅ Add dropdown to switch Y between:
 *    - Staff Morale
 *    - Patients Refused
 *
 * ✅ FIXES:
 * - Event categories are: donation, none, strike, flu
 * - Removed "Normal" label substitution (none stays "none")
 * - Added event normalization (case/whitespace safe)
 *
 * Existing features kept:
 * - Linear X scale (0–100)
 * - Deterministic jitter (wider near extremes)
 * - Clear brush button + click empty + dblclick + ESC
 * - Stable selection IDs
 * - Brush behind points
 * - Singleton tooltip
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const EVENT_COLORS = {
  none: "#95a5a6",
  flu: "#e74c3c",
  strike: "#8e44ad",
  donation: "#2ecc71",
};

const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71",
};

const SELECT_COLOR = "#ff8c00";

const Y_OPTIONS = [
  { key: "staff_morale", label: "Staff Morale" },
  { key: "patients_refused", label: "Patients Refused" },
];

function normalizeEvent(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e) return "none";
  if (e === "donation") return "donation";
  if (e === "strike") return "strike";
  if (e === "flu") return "flu";
  if (e === "none" || e === "normal") return "none";
  return e;
}

// IMPORTANT: stable across Y dropdown switches
function pointId(d) {
  const week = Number.isFinite(+d.week) ? +d.week : "na";
  const service = String(d.service ?? "na");
  const event = String(d.event ?? d.eventType ?? "none");

  const refusals = Number.isFinite(+d.patients_refused) ? (+d.patients_refused).toFixed(0) : "na";
  const morale = Number.isFinite(+d.staff_morale) ? (+d.staff_morale).toFixed(0) : "na";
  const satis = Number.isFinite(+d.patient_satisfaction) ? (+d.patient_satisfaction).toFixed(0) : "na";

  return `${week}__${service}__${event}__${refusals}__${morale}__${satis}`;
}


// deterministic 0..1 hash
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// deterministic x jitter
function xJitterPx(d) {
  const xPct = +d.pct_staff_present;
  const baseSpreadPx = 12;
  const extraSpreadPx = 8;
  const extremeBandPct = 8;

  const distToEdge = Math.min(xPct, 100 - xPct);
  const edgeProximity = Math.max(0, 1 - distToEdge / extremeBandPct);

  const spread = baseSpreadPx + extraSpreadPx * edgeProximity;
  const t = hash01(pointId(d)) - 0.5;
  return t * spread;
}

// ----- Interactive service legend filter helpers -----
function isServiceActive(scatterState, service) {
  if (!scatterState.serviceFilter) return true;
  return scatterState.serviceFilter.has(service);
}

function toggleService(scatterState, service, { solo = false } = {}) {
  const all = Object.keys(SERVICE_COLORS);

  if (solo) {
    // already solo -> reset
    if (scatterState.serviceFilter && scatterState.serviceFilter.size === 1 && scatterState.serviceFilter.has(service)) {
      scatterState.serviceFilter = null;
      return;
    }
    scatterState.serviceFilter = new Set([service]);
    return;
  }

  // if currently "all" (null), create explicit all-set then toggle
  if (!scatterState.serviceFilter) {
    scatterState.serviceFilter = new Set(all);
  }

  if (scatterState.serviceFilter.has(service)) scatterState.serviceFilter.delete(service);
  else scatterState.serviceFilter.add(service);

  // if back to all -> reset to null
  if (scatterState.serviceFilter.size === all.length) {
    scatterState.serviceFilter = null;
  }

  // avoid empty dead-end
  if (scatterState.serviceFilter && scatterState.serviceFilter.size === 0) {
    scatterState.serviceFilter = null;
  }
}

function resetServiceFilter(scatterState) {
  scatterState.serviceFilter = null;
}

export function init(svgElement, globalData, state, dispatch) {
  console.log("🎨 Initializing Task 3: Scatterplot Explorer");

  svgElement._scatterState = {
    globalData,
    state,
    dispatch,
    brushSelectionIds: new Set(),
    xScale: null,
    yScale: null,
    tooltipEl: null,
    keyHandlerAttached: false,
    yMetric: "staff_morale",
    serviceFilter: null, // ✅ NEW
    _ySelect: null,
    _ySelectHooked: false,
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

  // Controls row + dropdown
  const controls = wrapper
    .append("div")
    .attr("class", "scatter-controls")
    .style("padding", "15px 20px")
    .style("background-color", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .style("display", "flex")
    .style("align-items", "center")
    .style("justify-content", "space-between")
    .style("gap", "16px");

  const left = controls.append("div");
  left.html(`
    <div>
      <strong style="color: #2c3e50; font-size: 14px;">Task 3: Scatterplot Explorer</strong><br>
      <span style="color: #7f8c8d; font-size: 12px;">
        Drag to select points | Click empty area to clear | Double-click to clear | ESC to clear | Button to clear<br>
        X: Staff Present (%) | Y: (dropdown) | Size: Refusals | Fill: Event | Stroke: Service
      </span>
    </div>
  `);

  const right = controls
    .append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  right
    .append("span")
    .style("font-size", "12px")
    .style("color", "#2c3e50")
    .style("font-weight", "700")
    .text("Y:");

  const select = right
    .append("select")
    .attr("class", "scatter-y-select")
    .style("font-size", "12px")
    .style("padding", "6px 10px")
    .style("border", "1px solid #d0d7de")
    .style("border-radius", "8px")
    .style("background", "white")
    .style("cursor", "pointer");

  select
    .selectAll("option")
    .data(Y_OPTIONS)
    .enter()
    .append("option")
    .attr("value", (d) => d.key)
    .text((d) => d.label);

  svgElement._scatterState._ySelect = select;

  wrapper
    .append("svg")
    .attr("class", "scatter-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("background-color", "#ffffff")
    .style("min-height", "300px");

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

export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task3Data || globalData.task3Data.length === 0) {
      console.warn("⚠️ No Task 3 data available");
      return;
    }

    const scatterState = svgElement._scatterState;

    // hook dropdown once
    if (scatterState._ySelect && !scatterState._ySelectHooked) {
      scatterState._ySelectHooked = true;
      scatterState._ySelect
        .property("value", scatterState.yMetric)
        .on("change", function () {
          scatterState.yMetric = this.value;
          update(svgElement, globalData, state, dispatch);
        });
    }

    const yMetric = scatterState.yMetric || "staff_morale";
    const yLabel = Y_OPTIONS.find((o) => o.key === yMetric)?.label || "Staff Morale";

    // normalize event on the fly
    const data = globalData.task3Data.map((d) => ({ ...d, event: normalizeEvent(d.event) }));

    const svg = d3.select(svgElement).select("svg.scatter-chart");

    const svgNode = svg.node();
    let width = svgNode?.clientWidth || 1000;
    let height = svgNode?.clientHeight || 300;
    if (width < 100) width = 1000;
    if (height < 300) height = 300;

    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const gridLayer = g.append("g").attr("class", "layer-grid");
    const axesLayer = g.append("g").attr("class", "layer-axes");
    const brushLayer = g.append("g").attr("class", "layer-brush");
    const pointsLayer = g.append("g").attr("class", "layer-points");

    const xScale = d3.scaleLinear().domain([0, 100]).range([0, plotWidth]).clamp(true);

    // Y scale depends on dropdown
    const yExtent = d3.extent(data, (d) => +d[yMetric]);
    let yScale;

    if (yMetric === "patients_refused") {
      const ymax = Math.max(10, (yExtent?.[1] ?? 10));
      yScale = d3.scaleLinear().domain([0, ymax]).range([plotHeight, 0]).nice().clamp(true);
    } else {
      const yMin = Math.max(30, (yExtent?.[0] ?? 30) - 5);
      const yMax = Math.min(100, (yExtent?.[1] ?? 100) + 5);
      yScale = d3.scaleLinear().domain([yMin, yMax]).range([plotHeight, 0]).nice().clamp(true);
    }

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(data, (d) => +d.patients_refused) || 0])
      .range([5, 20]);

    const opacityScale = d3.scaleLinear().domain([60, 99]).range([0.3, 1.0]).clamp(true);

    scatterState.xScale = xScale;
    scatterState.yScale = yScale;

    const passesStateFilters = (d) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;
      if (state.selectedEventType && normalizeEvent(d.event) !== normalizeEvent(state.selectedEventType)) return false;
      if (state.stressOnly && d.stress_level !== "high") return false;
      if (!Number.isFinite(+d[yMetric])) return false;

      // ✅ legend-driven service filter
      if (!isServiceActive(scatterState, d.service)) return false;

      return true;
    };

    const hasSelection = () => scatterState.brushSelectionIds && scatterState.brushSelectionIds.size > 0;
    const isSelected = (d) => scatterState.brushSelectionIds?.has(pointId(d));

    const renderSelectionStyles = () => {
      pointsLayer
        .selectAll("circle.point")
        .style("display", (d) => (passesStateFilters(d) ? null : "none"))
        .style("opacity", (d) => {
          if (!passesStateFilters(d)) return 0;
          if (hasSelection()) return isSelected(d) ? opacityScale(+d.patient_satisfaction) : 0.08;
          return opacityScale(+d.patient_satisfaction);
        })
        .style("stroke", (d) =>
          hasSelection() && isSelected(d) ? SELECT_COLOR : SERVICE_COLORS[d.service] || "#95a5a6"
        )
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

    if (!scatterState.keyHandlerAttached) {
      scatterState.keyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (document.body.contains(svgElement)) clearSelection();
        }
      });
    }

    // Grid
    gridLayer
      .append("g")
      .attr("class", "grid")
      .style("stroke", "#e8e8e8")
      .style("stroke-dasharray", "2,4")
      .style("opacity", 0.3)
      .call(d3.axisLeft(yScale).tickSize(-plotWidth).tickFormat(""));

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(10).tickFormat((d) => `${d}%`);
    const yAxis = d3.axisLeft(yScale).ticks(10);

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
      .text(yLabel);

    // Clear brush button
    const clearBtn = g
      .append("g")
      .attr("class", "clear-brush-btn")
      .attr("transform", `translate(${plotWidth - 120}, 8)`)
      .style("cursor", "pointer")
      .on("click", (event) => {
        event.stopPropagation();
        clearSelection();
      });

    clearBtn
      .append("rect")
      .attr("width", 110)
      .attr("height", 26)
      .attr("rx", 6)
      .attr("ry", 6)
      .style("fill", "#ffffff")
      .style("stroke", "#bdc3c7")
      .style("stroke-width", 1);

    clearBtn
      .append("text")
      .attr("x", 55)
      .attr("y", 17)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .style("fill", "#2c3e50")
      .text("Clear brush");

    // Tooltip singleton
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
      const yVal = yMetric === "patients_refused" ? `${(+d.patients_refused).toFixed(0)}` : `${(+d.staff_morale).toFixed(0)}`;

      tooltip
        .html(`
          <strong style="font-size: 13px;">${d.service}</strong> - Week ${d.week}<br>
          <span style="color: #bdc3c7; display: block; margin-top: 5px;">
            Event: <strong>${normalizeEvent(d.event)}</strong><br>
            Staff Present: <strong>${(+d.pct_staff_present).toFixed(1)}%</strong><br>
            ${yLabel}: <strong>${yVal}</strong><br>
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

    // Points
    pointsLayer
      .selectAll("circle.point")
      .data(data, (d) => pointId(d))
      .join("circle")
      .attr("class", "point")
      .attr("cx", (d) => xScale(+d.pct_staff_present) + xJitterPx(d))
      .attr("cy", (d) => yScale(+d[yMetric]))
      .attr("r", (d) => sizeScale(+d.patients_refused))
      .style("fill", (d) => EVENT_COLORS[normalizeEvent(d.event)] || EVENT_COLORS.none)
      .style("cursor", "default")
      .on("mouseenter", function (event, d) {
        if (!passesStateFilters(d)) return;
        d3.select(this).style("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.35))");
        showTooltip(event, d);
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseleave", function () {
        d3.select(this).style("filter", "none");
        hideTooltip();
        renderSelectionStyles();
      });

    renderSelectionStyles();
    svg.on("mouseleave", hideTooltip);

    // Brush
    const brushState = { start: null, moved: false };

    const brushBg = brushLayer
      .append("rect")
      .attr("class", "brush-background")
      .attr("width", plotWidth)
      .attr("height", plotHeight)
      .style("fill", "transparent")
      .style("cursor", "crosshair");

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
          if (dx * dx + dy * dy > 9) brushState.moved = true;

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

          const selectedIds = new Set();
          for (const d of data) {
            if (!passesStateFilters(d)) continue; // ✅ respect service filter + state filters
            const cx = xScale(+d.pct_staff_present) + xJitterPx(d);
            const cy = yScale(+d[yMetric]);
            if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selectedIds.add(pointId(d));
          }

          scatterState.brushSelectionIds = selectedIds;
          renderSelectionStyles();
        })
        .on("end", () => {
          brushLayer.selectAll("rect.brush-rect").remove();

          if (hasSelection()) {
            const selectedWeeks = new Set();
            for (const d of data) {
              if (scatterState.brushSelectionIds.has(pointId(d))) selectedWeeks.add(d.week);
            }
            const weekArray = Array.from(selectedWeeks).sort((a, b) => a - b);
            if (weekArray.length > 0) {
              dispatch({ type: "SET_TIME_RANGE", value: [weekArray[0], weekArray[weekArray.length - 1]] });
            }
          }
        })
    );

    _updateScatterLegend(svgElement, globalData, state, dispatch);
  } catch (error) {
    console.error("❌ Error in Scatter update:", error);
  }
}

function _updateScatterLegend(svgElement, globalData, state, dispatch) {
  const scatterState = svgElement._scatterState;
  const legendDiv = d3.select(svgElement).select(".scatter-legend");
  legendDiv.selectAll("*").remove();

  const eventOrder = ["donation", "flu", "strike", "none"];

  const eventHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Event Type (Fill Color)</strong>
      ${eventOrder
        .filter((e) => EVENT_COLORS[e])
        .map(
          (event) => `
          <div style="display: flex; align-items: center; margin: 6px 0;">
            <span style="
              display: inline-block;
              width: 12px;
              height: 12px;
              background-color: ${EVENT_COLORS[event]};
              border-radius: 50%;
              margin-right: 8px;
              border: 1px solid #ccc;
            "></span>
            <span style="font-size: 11px; color: #2c3e50;">${event}</span>
          </div>
        `
        )
        .join("")}
    </div>
  `;

  // --- Service legend: interactive (D3-built, not HTML string) ---
  const serviceWrap = legendDiv
    .append("div")
    .style("user-select", "none");

  const serviceHeader = serviceWrap
    .append("strong")
    .style("color", "#2c3e50")
    .style("display", "block")
    .style("margin-bottom", "10px")
    .style("font-size", "12px")
    .style("cursor", "pointer")
    .text("Service Type (Border Color) — click to filter • Shift+click to solo • dblclick to reset")
    .on("dblclick", () => {
      resetServiceFilter(scatterState);
      update(svgElement, globalData, state, dispatch);
    });

  const services = Object.keys(SERVICE_COLORS);

  const items = serviceWrap
    .selectAll("div.service-item")
    .data(services)
    .enter()
    .append("div")
    .attr("class", "service-item")
    .style("display", "flex")
    .style("align-items", "center")
    .style("margin", "6px 0")
    .style("cursor", "pointer")
    .on("click", (event, service) => {
      const solo = !!event.shiftKey;
      toggleService(scatterState, service, { solo });
      update(svgElement, globalData, state, dispatch);
    });

  items
    .append("span")
    .style("display", "inline-block")
    .style("width", "12px")
    .style("height", "12px")
    .style("border", (d) => `2px solid ${SERVICE_COLORS[d]}`)
    .style("border-radius", "50%")
    .style("background-color", "white")
    .style("margin-right", "8px");

  items
    .append("span")
    .style("font-size", "11px")
    .style("color", "#2c3e50")
    .text((service) => service.replaceAll("_", " "));

  // Apply active/inactive styling
  const applyLegendStyles = () => {
    const anyFilter = !!scatterState.serviceFilter;
    items
      .style("opacity", (service) => {
        if (!anyFilter) return 1;
        return scatterState.serviceFilter.has(service) ? 1 : 0.25;
      })
      .style("filter", (service) => {
        if (!anyFilter) return "none";
        return scatterState.serviceFilter.has(service) ? "drop-shadow(0 0 3px rgba(0,0,0,0.12))" : "none";
      });

    serviceHeader
      .style("opacity", anyFilter ? 1 : 0.95);
  };
  applyLegendStyles();

  const sizeHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">Bubble Size</strong>
      <span style="font-size: 11px; color: #7f8c8d;">
        Size = Patients Refused<br>
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

  const jitterHtml = `
    <div>
      <strong style="color: #2c3e50; display: block; margin-bottom: 10px; font-size: 12px;">X Jitter</strong>
      <span style="font-size: 11px; color: #7f8c8d;">
        Points are jittered slightly in X to reduce overlap.<br>
        Jitter widens near 0% and 100%.
      </span>
    </div>
  `;

  // Put the non-interactive sections into the grid as HTML blocks
  // (event block + the other blocks)
  legendDiv
    .insert("div", ":first-child")
    .html(eventHtml);

  legendDiv
    .append("div")
    .html(sizeHtml);

  legendDiv
    .append("div")
    .html(opacityHtml);

  legendDiv
    .append("div")
    .html(selectionHtml);

  legendDiv
    .append("div")
    .html(jitterHtml);
}
