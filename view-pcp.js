/**
 * TASK 5: Parallel Coordinate Plot (PCP) — FIXED / IMPROVED
 *
 * What I fixed / improved (the important stuff):
 * ✅ Uses proper d3.brushY on EACH axis (not manual drag + custom rect)
 * ✅ Supports MULTI-AXIS brushing (intersection across active brushes)
 * ✅ Selection stored by STABLE IDs (not array indices) so it won’t “jump” after updates
 * ✅ Clear Brush button actually clears ALL axis brushes + selection
 * ✅ Hover tooltip is SINGLETON (no DOM leaks, no body-level mousemove handler)
 * ✅ Brush layer does NOT block hover (brush handles are on axis groups, polylines are separate layer)
 * ✅ Styling is consistent: filtered-out (state filters) fade hard, unselected fade, selected highlight thicker
 *
 * Coordination:
 * - On brush end, dispatches SET_TIME_RANGE from selected weeks (like your old version)
 * - (Optional) You can also dispatch a “PCP_SELECTION” event if your app supports it.
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71",
};

const STRESS_OPACITY = {
  low: 0.2,
  moderate: 0.5,
  high: 1.0,
};

const SELECT_STROKE = "#ff8c00"; // orange highlight for selected
const UNSELECTED_OPACITY = 0.08;
const FILTERED_OUT_OPACITY = 0.04;

export function init(svgElement, globalData, state, dispatch) {
  console.log("🎨 Initializing Task 5: Parallel Coordinate Plot");

  svgElement._pcpState = {
    globalData,
    state,
    dispatch,
    // Map axisKey -> [minVal, maxVal] in data units (not pixels)
    activeBrushRanges: new Map(),
    // Set of stable IDs for selected rows
    selectedIds: new Set(),
    tooltipEl: null,
    keyHandlerAttached: false,
  };

  _createPCPStructure(svgElement);
  update(svgElement, globalData, state, dispatch);
}

function _createPCPStructure(svgElement) {
  d3.select(svgElement).selectAll("*").remove();

  const wrapper = d3
    .select(svgElement)
    .append("div")
    .attr("class", "pcp-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");

  wrapper
    .append("div")
    .attr("class", "pcp-controls")
    .style("padding", "15px")
    .style("background-color", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div style="display: flex; gap: 20px; align-items: center;">
        <div>
          <strong style="color: #2c3e50;">Task 5: Parallel Coordinate Plot</strong><br>
          <span style="color: #7f8c8d; font-size: 12px;">
            Brush on any axis (multi-axis supported). Colors = Services. Opacity = Stress Level.
            Click “Clear Brush” or press ESC to reset.
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

  wrapper
    .append("svg")
    .attr("class", "pcp-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("min-height", "520px")
    .style("background-color", "#ffffff");

  wrapper
    .append("div")
    .attr("class", "pcp-legend")
    .style("padding", "15px")
    .style("background-color", "#ffffff")
    .style("border-top", "1px solid #e0e0e0")
    .style("font-size", "12px");
}

// If you have a true unique id (d.id), use it here instead.
function rowId(d) {
  return [
    d.week,
    d.service,
    d.event ?? "na",
    d.available_beds,
    d.patients_refused,
    d.staff_morale,
    d.patient_satisfaction,
    d.stress_level,
  ].join("__");
}

export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task5Data || globalData.task5Data.length === 0) {
      console.warn("⚠️ No Task 5 data available");
      return;
    }

    const data = globalData.task5Data;
    const svg = d3.select(svgElement).select("svg.pcp-chart");

    const margin = { top: 30, right: 30, bottom: 40, left: 60 };

    const svgNode = svg.node();
    let width = (svgNode?.clientWidth || 1000) - margin.left - margin.right;
    let height = Math.max(520, (svgNode?.clientHeight || 520)) - margin.top - margin.bottom;
    if (width < 300) width = 900;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const pcpState = svgElement._pcpState;

    // ========== AXES DEFINITION ==========
    const axes = [
      { key: "week", label: "Week", nice: true },
      { key: "available_beds", label: "Available Beds", nice: true },
      { key: "patients_refused", label: "Patients Refused", nice: true },
      { key: "staff_morale", label: "Staff Morale", nice: true },
      { key: "patient_satisfaction", label: "Patient Satisfaction", nice: true },
    ];

    // ========== STATE FILTERS ==========
    const passesStateFilters = (d) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;
      if (state.selectedEventType && d.event !== state.selectedEventType) return false;
      if (state.stressOnly && d.stress_level !== "high") return false;
      return true;
    };

    // ========== SCALES ==========
    const yScales = {};
    for (const axis of axes) {
      const extent = d3.extent(data, (d) => +d[axis.key]);
      const dom = extent[0] === extent[1] ? [extent[0] - 1, extent[1] + 1] : extent;

      yScales[axis.key] = d3
        .scaleLinear()
        .domain(dom)
        .range([height, 0])
        .nice(axis.nice);
    }

    const xScale = d3.scalePoint().domain(axes.map((a) => a.key)).range([0, width]).padding(0.3);

    // ========== LAYERS ==========
    const backgroundLayer = g.append("g").attr("class", "pcp-bg");
    const linesLayer = g.append("g").attr("class", "pcp-lines");
    const axesLayer = g.append("g").attr("class", "pcp-axes");

    // Subtle background horizontal guides
    backgroundLayer
      .append("g")
      .attr("class", "pcp-hguides")
      .selectAll("line")
      .data(d3.range(0, 6))
      .join("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d) => (height * d) / 5)
      .attr("y2", (d) => (height * d) / 5)
      .style("stroke", "#f0f0f0");

    // ========== TOOLTIP (singleton) ==========
    const getTooltip = () => {
      if (pcpState.tooltipEl && document.body.contains(pcpState.tooltipEl.node())) return pcpState.tooltipEl;

      pcpState.tooltipEl = d3
        .select("body")
        .append("div")
        .attr("class", "pcp-tooltip")
        .style("position", "fixed")
        .style("background-color", "#2c3e50")
        .style("color", "white")
        .style("padding", "10px 12px")
        .style("border-radius", "6px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("z-index", "1000")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.2)")
        .style("max-width", "360px")
        .style("display", "none");

      return pcpState.tooltipEl;
    };

    const showTooltip = (event, d) => {
      const tooltip = getTooltip();
      tooltip
        .html(`
          <strong style="font-size: 13px;">${d.service}</strong> — Week ${d.week}<br>
          <span style="color:#bdc3c7; display:block; margin-top:6px;">
            Beds: <strong>${d.available_beds}</strong> | Refused: <strong>${d.patients_refused}</strong><br>
            Morale: <strong>${d.staff_morale}</strong> | Satisfaction: <strong>${d.patient_satisfaction}</strong><br>
            Stress: <strong>${d.stress_level}</strong>
          </span>
        `)
        .style("display", "block");

      const x = event?.pageX ?? event?.clientX ?? 0;
      const y = event?.pageY ?? event?.clientY ?? 0;
      tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
    };

    const moveTooltip = (event) => {
      if (!pcpState.tooltipEl || pcpState.tooltipEl.style("display") === "none") return;
      const x = event?.pageX ?? event?.clientX ?? 0;
      const y = event?.pageY ?? event?.clientY ?? 0;
      pcpState.tooltipEl.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
    };

    const hideTooltip = () => {
      if (pcpState.tooltipEl) pcpState.tooltipEl.style("display", "none");
    };

    // ========== PATH GENERATOR ==========
    const pointsForRow = (d) =>
      axes.map((axis) => [xScale(axis.key), yScales[axis.key](+d[axis.key])]);

    const lineGen = d3.line();

    // ========== SELECTION LOGIC (multi-axis intersection) ==========
    const recomputeSelectionFromBrushes = () => {
      const active = pcpState.activeBrushRanges; // Map axisKey -> [min,max]
      if (!active || active.size === 0) {
        pcpState.selectedIds = new Set();
        return;
      }

      const selected = new Set();
      for (const d of data) {
        let ok = true;
        for (const [axisKey, [minV, maxV]] of active.entries()) {
          const v = +d[axisKey];
          if (v < minV || v > maxV) {
            ok = false;
            break;
          }
        }
        if (ok) selected.add(rowId(d));
      }
      pcpState.selectedIds = selected;
    };

    const hasSelection = () => pcpState.selectedIds && pcpState.selectedIds.size > 0;
    const isSelected = (d) => pcpState.selectedIds?.has(rowId(d));

    const applyLineStyles = () => {
      linesLayer
        .selectAll("path.pcp-line")
        .style("stroke", (d) => (hasSelection() && isSelected(d) ? SELECT_STROKE : SERVICE_COLORS[d.service] || "#95a5a6"))
        .style("stroke-width", (d) => {
          if (!passesStateFilters(d)) return 1;
          if (!hasSelection()) return 1.3;
          return isSelected(d) ? 2.6 : 1;
        })
        .style("opacity", (d) => {
          if (!passesStateFilters(d)) return FILTERED_OUT_OPACITY;
          if (!hasSelection()) return STRESS_OPACITY[d.stress_level] ?? 0.5;
          return isSelected(d) ? (STRESS_OPACITY[d.stress_level] ?? 0.5) : UNSELECTED_OPACITY;
        })
        .style("filter", (d) => (hasSelection() && isSelected(d) ? "drop-shadow(0 0 3px rgba(255,140,0,0.35))" : "none"));
    };

    const clearAllBrushes = () => {
      // Clear internal state
      pcpState.activeBrushRanges = new Map();
      pcpState.selectedIds = new Set();

      // Clear the actual d3 brushes by moving them to null
      axesLayer.selectAll(".axis-brush").each(function () {
        const brush = d3.select(this).datum()?.__brush;
        // Not reliable to fetch internal brush; easiest is to store brush instance via closure.
        // Instead, we keep a reference on the node (set below).
        const b = this.__pcpBrush;
        if (b) d3.select(this).call(b.move, null);
      });

      applyLineStyles();
      hideTooltip();
    };

    // ESC clears brushes (attach once)
    if (!pcpState.keyHandlerAttached) {
      pcpState.keyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (document.body.contains(svgElement)) clearAllBrushes();
        }
      });
    }

    // ========== DRAW LINES ==========
    linesLayer
      .selectAll("path.pcp-line")
      .data(data, (d) => rowId(d))
      .join("path")
      .attr("class", "pcp-line")
      .attr("d", (d) => lineGen(pointsForRow(d)))
      .style("fill", "none")
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round")
      .on("mouseenter", function (event, d) {
        d3.select(this).style("stroke-width", 3).style("opacity", 1);
        showTooltip(event, d);
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseleave", function () {
        hideTooltip();
        applyLineStyles();
      });

    applyLineStyles();
    svg.on("mouseleave", hideTooltip);

    // ========== DRAW AXES + BRUSH PER AXIS ==========
    const axisGroups = axesLayer
      .selectAll("g.axis-group")
      .data(axes, (d) => d.key)
      .join("g")
      .attr("class", "axis-group")
      .attr("transform", (d) => `translate(${xScale(d.key)},0)`);

    axisGroups
      .append("line")
      .attr("class", "axis-line")
      .attr("y1", 0)
      .attr("y2", height)
      .style("stroke", "#bdc3c7")
      .style("stroke-width", 2);

    axisGroups
      .append("text")
      .attr("class", "axis-label")
      .attr("y", -14)
      .attr("text-anchor", "middle")
      .style("font-weight", "700")
      .style("fill", "#2c3e50")
      .style("font-size", "12px")
      .text((d) => d.label);

    // Ticks
    axisGroups.each(function (axis) {
      const scale = yScales[axis.key];
      const tickValues = scale.ticks(5);

      const ticksG = d3.select(this).append("g").attr("class", "axis-ticks");
      ticksG
        .selectAll("g.tick")
        .data(tickValues)
        .join("g")
        .attr("class", "tick")
        .attr("transform", (d) => `translate(0,${scale(d)})`)
        .call((tickG) => {
          tickG
            .append("line")
            .attr("x2", -6)
            .style("stroke", "#bdc3c7")
            .style("stroke-width", 1);

          tickG
            .append("text")
            .attr("x", -10)
            .attr("dy", "0.32em")
            .attr("text-anchor", "end")
            .style("font-size", "10px")
            .style("fill", "#7f8c8d")
            .text((d) => d.toFixed(0));
        });
    });

    // Brush per axis
    axisGroups.each(function (axis) {
      const scale = yScales[axis.key];

      const brush = d3
        .brushY()
        .extent([
          [-18, 0],
          [18, height],
        ])
        .on("brush", ({ selection }) => {
          if (!selection) return;

          const [y0, y1] = selection;
          const v0 = scale.invert(y1);
          const v1 = scale.invert(y0);
          const minV = Math.min(v0, v1);
          const maxV = Math.max(v0, v1);

          pcpState.activeBrushRanges.set(axis.key, [minV, maxV]);
          recomputeSelectionFromBrushes();
          applyLineStyles();
        })
        .on("end", ({ selection }) => {
          // If brush cleared on this axis, remove it from active ranges
          if (!selection) {
            pcpState.activeBrushRanges.delete(axis.key);
            recomputeSelectionFromBrushes();
            applyLineStyles();
          }

          // Dispatch linked time range from selection (if any)
          if (hasSelection()) {
            const weeks = new Set();
            for (const d of data) {
              if (pcpState.selectedIds.has(rowId(d))) weeks.add(+d.week);
            }
            const weekArray = Array.from(weeks).sort((a, b) => a - b);
            if (weekArray.length > 0) {
              dispatch({
                type: "SET_TIME_RANGE",
                value: [weekArray[0], weekArray[weekArray.length - 1]],
              });
            }

            // OPTIONAL (only if your app understands it):
            // dispatch({ type: "PCP_SELECTION", value: Array.from(pcpState.selectedIds) });
          }
        });

      // Attach brush group
      const brushG = d3
        .select(this)
        .append("g")
        .attr("class", "axis-brush")
        .call(brush);

      // Store brush instance for clearing later
      brushG.node().__pcpBrush = brush;

      // Style brush selection to match your UI
      brushG.selectAll(".selection").style("fill", "#3498db").style("fill-opacity", 0.2).style("stroke", "#3498db");
      brushG.selectAll(".handle").style("fill", "#3498db");
    });

    // ========== Hook up Clear Brush button ==========
    d3.select(svgElement)
      .select("#pcp-reset-brush")
      .on("click", () => {
        clearAllBrushes();
        console.log("🔄 PCP brushes cleared");
      });

    _updatePCPLegend(svgElement);
  } catch (error) {
    console.error("❌ Error in PCP update:", error);
  }
}

function _updatePCPLegend(svgElement) {
  const legendDiv = d3.select(svgElement).select(".pcp-legend");
  legendDiv.selectAll("*").remove();

  const serviceHtml = `
    <div style="margin-bottom: 12px;">
      <strong style="color: #2c3e50;">Services (Color):</strong><br>
      ${Object.entries(SERVICE_COLORS)
        .map(
          ([service, color]) => `
        <span style="display: inline-block; margin-right: 18px; margin-top: 6px;">
          <span style="
            display: inline-block;
            width: 12px;
            height: 12px;
            background-color: ${color};
            border-radius: 2px;
            margin-right: 6px;
            vertical-align: middle;
          "></span>
          <span style="font-size: 11px;">${service.replaceAll("_", " ")}</span>
        </span>
      `
        )
        .join("")}
    </div>
  `;

  const stressHtml = `
    <div style="margin-bottom: 10px;">
      <strong style="color: #2c3e50;">Stress (Opacity):</strong><br>
      ${Object.entries(STRESS_OPACITY)
        .map(
          ([level, opacity]) => `
        <span style="display: inline-block; margin-right: 18px; margin-top: 6px;">
          <span style="
            display: inline-block;
            width: 16px;
            height: 3px;
            background-color: #2c3e50;
            opacity: ${opacity};
            margin-right: 6px;
            vertical-align: middle;
          "></span>
          <span style="font-size: 11px;">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
        </span>
      `
        )
        .join("")}
    </div>
  `;

  const selectionHtml = `
    <div>
      <strong style="color: #2c3e50;">Selection:</strong><br>
      <span style="font-size: 11px; color: #7f8c8d;">
        Selected lines turn <span style="color:${SELECT_STROKE}; font-weight:700;">orange</span> and get thicker.
        Unselected lines fade.
      </span>
    </div>
  `;

  legendDiv.html(serviceHtml + stressHtml + selectionHtml);
}
