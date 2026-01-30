/**
 * TASK 5: Parallel Coordinate Plot (PCP) — Interactive legend (Service + Stress) + Fixed axis caps
 *
 * Removed Event legend filter entirely (no UI + no filtering logic)
 *  Keeps:
 * - Interactive Service legend (multi-select) [LOCAL ONLY]
 * - Interactive Stress legend (single-select) [LOCAL ONLY]
 * - Multi-axis brushing + intersection selection
 * - Axis caps: Week max=42, Available Beds max=80, Patients Refused max=400
 * - Clear Brush button clears all axis brushes + selection (keeps legend filters)
 * - Clear Filters button resets Service + Stress filters
 *
 *  Cross-view link:
 * - When PCP has a selection, it dispatches SET_TIME_RANGE
 * - It also respects state.timeRange (from Task 3 brush, calendar, etc.)
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

const SELECT_STROKE = "#ff8c00";
const UNSELECTED_OPACITY = 0.08;
const FILTERED_OUT_OPACITY = 0.04;

export function init(svgElement, globalData, state, dispatch) {
  console.log("Initializing Task 5: Parallel Coordinate Plot");

  svgElement._pcpState = {
    globalData,
    state,
    dispatch,
    activeBrushRanges: new Map(), // axisKey -> [min,max]
    selectedIds: new Set(),
    legendFilters: {
      services: new Set(), // empty = all
      stress: null, // "low" | "moderate" | "high" | null
    },
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
            Brush any axis (multi-axis supported). Tap legend Service/Stress to filter. Press ESC to clear brushes.
          </span>
        </div>
        <button id="pcp-reset-brush" style="
          margin-left:auto;
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

// Stable ID
function rowId(d) {
  const week = Number.isFinite(+d.week) ? +d.week : "na";
  const service = String(d.service ?? "na");
  const event = String(d.event ?? d.eventType ?? "none");

  const refusals = Number.isFinite(+d.patients_refused) ? (+d.patients_refused).toFixed(0) : "na";
  const morale = Number.isFinite(+d.staff_morale) ? (+d.staff_morale).toFixed(0) : "na";
  const satis = Number.isFinite(+d.patient_satisfaction) ? (+d.patient_satisfaction).toFixed(0) : "na";

  return `${week}__${service}__${event}__${refusals}__${morale}__${satis}`;
}


export function update(svgElement, globalData, state, dispatch) {
  try {
    if (!globalData.task5Data || globalData.task5Data.length === 0) {
      console.warn("No Task 5 data available");
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

    const axes = [
      { key: "week", label: "Week", capMin: 1, capMax: 42, nice: true },
      { key: "available_beds", label: "Available Beds", capMin: 0, capMax: 80, nice: true },
      { key: "patients_refused", label: "Patients Refused", capMin: 0, capMax: 400, nice: true },
      { key: "staff_morale", label: "Staff Morale", capMin: 0, capMax: 100, nice: true },
      { key: "patient_satisfaction", label: "Patient Satisfaction", capMin: 0, capMax: 100, nice: true },
    ];

    // ===== GLOBAL (dashboard) filters =====
    const passesGlobalStateFilters = (d) => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      if (state.selectedWeek && d.week !== state.selectedWeek) return false;

      // If your global event filter is normalized elsewhere, consider normalizing here too.
      if (state.selectedEventType && d.event !== state.selectedEventType) return false;

      if (state.stressOnly && d.stress_level !== "high") return false;
      return true;
    };

    // ===== PCP LEGEND (local) filters =====
    const passesLegendFilters = (d) => {
      const lf = pcpState.legendFilters;
      if (lf.services && lf.services.size > 0 && !lf.services.has(d.service)) return false;
      if (lf.stress && d.stress_level !== lf.stress) return false;
      return true;
    };

    const passesAllFilters = (d) => passesGlobalStateFilters(d) && passesLegendFilters(d);

    // ===== SCALES (capped) =====
    const yScales = {};
    for (const axis of axes) {
      const extent = d3.extent(data, (d) => +d[axis.key]);
      let d0 = extent?.[0] ?? axis.capMin ?? 0;
      let d1 = extent?.[1] ?? axis.capMax ?? 1;

      if (axis.capMin != null) d0 = Math.max(axis.capMin, d0);
      if (axis.capMax != null) d1 = Math.min(axis.capMax, d1);

      if (!Number.isFinite(d0)) d0 = axis.capMin ?? 0;
      if (!Number.isFinite(d1)) d1 = axis.capMax ?? 1;
      if (d0 === d1) d1 = d0 + 1;

      yScales[axis.key] = d3.scaleLinear().domain([d0, d1]).range([height, 0]).nice(axis.nice).clamp(true);
    }

    const xScale = d3.scalePoint().domain(axes.map((a) => a.key)).range([0, width]).padding(0.3);

    // ===== LAYERS =====
    const bg = g.append("g").attr("class", "pcp-bg");
    const linesLayer = g.append("g").attr("class", "pcp-lines");
    const axesLayer = g.append("g").attr("class", "pcp-axes");

    bg.append("g")
      .selectAll("line")
      .data(d3.range(0, 6))
      .join("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d) => (height * d) / 5)
      .attr("y2", (d) => (height * d) / 5)
      .style("stroke", "#f0f0f0");

    // ===== TOOLTIP (singleton) =====
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
            Stress: <strong>${d.stress_level}</strong><br>
            Beds: <strong>${d.available_beds}</strong> | Refused: <strong>${d.patients_refused}</strong><br>
            Morale: <strong>${d.staff_morale}</strong> | Satisfaction: <strong>${d.patient_satisfaction}</strong>
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

    // ===== LINE GEN =====
    const pts = (d) => axes.map((axis) => [xScale(axis.key), yScales[axis.key](+d[axis.key])]);
    const lineGen = d3.line();

    // ===== BRUSH INTERSECTION SELECTION =====
    const recomputeSelectionFromBrushes = () => {
      const active = pcpState.activeBrushRanges;
      if (!active || active.size === 0) {
        pcpState.selectedIds = new Set();
        return;
      }

      const selected = new Set();
      for (const d of data) {
        if (!passesAllFilters(d)) continue;

        let ok = true;
        for (const [axisKey, [minV, maxV]] of active.entries()) {
          const v = +d[axisKey];
          if (v < minV || v > maxV) { ok = false; break; }
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
          if (!passesAllFilters(d)) return 1;
          if (!hasSelection()) return 1.3;
          return isSelected(d) ? 2.6 : 1;
        })
        .style("opacity", (d) => {
          if (!passesAllFilters(d)) return FILTERED_OUT_OPACITY;
          if (!hasSelection()) return STRESS_OPACITY[d.stress_level] ?? 0.5;
          return isSelected(d) ? STRESS_OPACITY[d.stress_level] ?? 0.5 : UNSELECTED_OPACITY;
        })
        .style("filter", (d) => (hasSelection() && isSelected(d) ? "drop-shadow(0 0 3px rgba(255,140,0,0.35))" : "none"));
    };

    const clearAllBrushes = () => {
      pcpState.activeBrushRanges = new Map();
      pcpState.selectedIds = new Set();

      axesLayer.selectAll(".axis-brush").each(function () {
        const b = this.__pcpBrush;
        if (b) d3.select(this).call(b.move, null);
      });

      applyLineStyles();
      hideTooltip();
    };

    const clearLegendFilters = () => {
      pcpState.legendFilters.services = new Set();
      pcpState.legendFilters.stress = null;

      recomputeSelectionFromBrushes();
      applyLineStyles();

      _updatePCPLegend(svgElement, pcpState);
      _wireLegendInteractions(svgElement, pcpState, onLegendChange, clearLegendFilters);
    };

    const onLegendChange = () => {
      recomputeSelectionFromBrushes();
      applyLineStyles();
    };

    // ESC clears brushes only
    if (!pcpState.keyHandlerAttached) {
      pcpState.keyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (document.body.contains(svgElement)) clearAllBrushes();
        }
      });
    }

    // ===== DRAW LINES =====
    linesLayer
      .selectAll("path.pcp-line")
      .data(data, (d) => rowId(d))
      .join("path")
      .attr("class", "pcp-line")
      .attr("d", (d) => lineGen(pts(d)))
      .style("fill", "none")
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round")
      .on("pointerenter", function (event, d) {
        if (!passesAllFilters(d)) return;
        d3.select(this).style("stroke-width", 3).style("opacity", 1);
        showTooltip(event, d);
      })
      .on("pointermove", function (event) { moveTooltip(event); })
      .on("pointerleave", function () {
        hideTooltip();
        applyLineStyles();
      });

    applyLineStyles();
    svg.on("mouseleave", hideTooltip);

    // ===== DRAW AXES =====
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
          tickG.append("line").attr("x2", -6).style("stroke", "#bdc3c7").style("stroke-width", 1);
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

    // ===== BRUSH PER AXIS =====
    axisGroups.each(function (axis) {
      const scale = yScales[axis.key];

      const brush = d3
        .brushY()
        .extent([[-18, 0], [18, height]])
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
          if (!selection) {
            pcpState.activeBrushRanges.delete(axis.key);
            recomputeSelectionFromBrushes();
            applyLineStyles();
            return;
          }

          // ✅ cross-view link: selection -> time range
          if (hasSelection()) {
            const weeks = new Set();
            for (const d of data) {
              if (pcpState.selectedIds.has(rowId(d))) weeks.add(+d.week);
            }
            const weekArray = Array.from(weeks).sort((a, b) => a - b);
            if (weekArray.length > 0) {
              dispatch({ type: "SET_TIME_RANGE", value: [weekArray[0], weekArray[weekArray.length - 1]] });
            }
          }
        });

      const brushG = d3.select(this).append("g").attr("class", "axis-brush").call(brush);
      brushG.node().__pcpBrush = brush;

      brushG.selectAll(".selection").style("fill", "#3498db").style("fill-opacity", 0.2).style("stroke", "#3498db");
      brushG.selectAll(".handle").style("fill", "#3498db");
    });

    // ===== Clear Brush button =====
    d3.select(svgElement).select("#pcp-reset-brush").on("click", () => clearAllBrushes());

    // ===== LEGEND =====
    _updatePCPLegend(svgElement, pcpState);
    _wireLegendInteractions(svgElement, pcpState, onLegendChange, clearLegendFilters);

  } catch (error) {
    console.error(" Error in PCP update:", error);
  }
}

function _updatePCPLegend(svgElement, pcpState) {
  const legend = d3.select(svgElement).select(".pcp-legend");
  legend.selectAll("*").remove();

  const lf = pcpState.legendFilters;

  const section = (title) =>
    legend
      .append("div")
      .style("margin-bottom", "12px")
      .call((d) => d.append("div").style("font-weight", "700").style("color", "#2c3e50").text(title));

  // Services (multi-select)
  const s1 = section("Services (Tap to filter):");
  const sRow = s1.append("div").style("margin-top", "6px").attr("data-role", "service-row");

  const services = Object.keys(SERVICE_COLORS);
  const serviceActive = (svc) => (lf.services.size === 0 ? true : lf.services.has(svc));

  services.forEach((svc) => {
    const active = serviceActive(svc);

    const btn = sRow
      .append("button")
      .attr("type", "button")
      .attr("data-service", svc)
      .style("margin-right", "10px")
      .style("margin-top", "6px")
      .style("padding", "6px 10px")
      .style("border-radius", "999px")
      .style("border", active ? "2px solid #2c3e50" : "1px solid #d0d0d0")
      .style("background", active ? "#eef2f5" : "#ffffff")
      .style("cursor", "pointer")
      .style("font-size", "11px")
      .style("display", "inline-flex")
      .style("align-items", "center")
      .style("gap", "6px");

    btn
      .append("span")
      .style("display", "inline-block")
      .style("width", "12px")
      .style("height", "12px")
      .style("border-radius", "2px")
      .style("background", SERVICE_COLORS[svc])
      .style("opacity", active ? 1 : 0.35);

    btn.append("span").text(svc.replaceAll("_", " "));
  });

  // Stress (single-select)
  const st1 = section("Stress (Tap to filter):");
  const stRow = st1.append("div").style("margin-top", "6px").attr("data-role", "stress-row");

  const stresses = [
    { key: null, label: "All", opacity: 1.0 },
    { key: "low", label: "Low", opacity: STRESS_OPACITY.low },
    { key: "moderate", label: "Moderate", opacity: STRESS_OPACITY.moderate },
    { key: "high", label: "High", opacity: STRESS_OPACITY.high },
  ];

  stresses.forEach((st) => {
    const isActive = lf.stress === st.key || (lf.stress === null && st.key === null);

    const btn = stRow
      .append("button")
      .attr("type", "button")
      .attr("data-stress", st.key === null ? "" : st.key)
      .style("margin-right", "10px")
      .style("margin-top", "6px")
      .style("padding", "6px 10px")
      .style("border-radius", "999px")
      .style("border", isActive ? "2px solid #2c3e50" : "1px solid #d0d0d0")
      .style("background", isActive ? "#eef2f5" : "#ffffff")
      .style("cursor", "pointer")
      .style("font-size", "11px")
      .style("display", "inline-flex")
      .style("align-items", "center")
      .style("gap", "6px");

    btn
      .append("span")
      .style("width", "16px")
      .style("height", "3px")
      .style("display", "inline-block")
      .style("background", "#2c3e50")
      .style("opacity", st.opacity);

    btn.append("span").text(st.label);
  });

  // Clear filters
  legend
    .append("div")
    .style("margin-top", "10px")
    .append("button")
    .attr("type", "button")
    .attr("data-role", "clear-filters")
    .style("padding", "6px 10px")
    .style("border-radius", "6px")
    .style("border", "1px solid #d0d0d0")
    .style("background", "#ffffff")
    .style("cursor", "pointer")
    .style("font-size", "11px")
    .text("Clear Service/Stress Filters");

  // Selection note
  legend
    .append("div")
    .style("margin-top", "10px")
    .html(`
      <strong style="color:#2c3e50;">Selection:</strong><br>
      <span style="font-size: 11px; color: #7f8c8d;">
        Selected lines turn <span style="color:${SELECT_STROKE}; font-weight:700;">orange</span> and get thicker.
        Unselected lines fade.
      </span>
    `);
}

function _wireLegendInteractions(svgElement, pcpState, onChange, clearLegendFilters) {
  const legend = d3.select(svgElement).select(".pcp-legend");

  // Services (multi-select)
  legend.selectAll('button[data-service]').on("pointerdown", function (event) {
    event.preventDefault();
    const svc = d3.select(this).attr("data-service");

    const set = new Set(pcpState.legendFilters.services);
    if (set.size === 0) {
      set.add(svc);
    } else {
      if (set.has(svc)) set.delete(svc);
      else set.add(svc);
      // empty => all
    }

    pcpState.legendFilters.services = set;

    _updatePCPLegend(svgElement, pcpState);
    _wireLegendInteractions(svgElement, pcpState, onChange, clearLegendFilters);
    onChange();
  });

  // Stress (single-select)
  legend.selectAll('button[data-stress]').on("pointerdown", function (event) {
    event.preventDefault();
    const v = d3.select(this).attr("data-stress");
    const newVal = v === "" ? null : v;

    pcpState.legendFilters.stress = pcpState.legendFilters.stress === newVal ? null : newVal;

    _updatePCPLegend(svgElement, pcpState);
    _wireLegendInteractions(svgElement, pcpState, onChange, clearLegendFilters);
    onChange();
  });

  // Clear filters
  legend.selectAll('button[data-role="clear-filters"]').on("pointerdown", function (event) {
    event.preventDefault();
    clearLegendFilters();
  });
}
