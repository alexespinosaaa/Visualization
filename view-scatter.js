// view-scatter.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Task — Linked Scatterplot Explorer (composition vs outcome)
 *
 * What this version fixes / improves (without changing your app architecture):
 * - Height stays ~300px (responsive width)
 * - Uses ABU-style events: flu / strike / donation / none (no "normal")
 * - Deterministic jitter (stable per point) + slightly wider near extremes
 * - TRUE linked brushing:
 *    • Drag rectangle to select points -> dispatch SET_TIME_RANGE (min..max week in selection)
 *    • Selected points highlight (orange), others fade
 * - Clear selection:
 *    • Button "Clear brush" (top-right)
 *    • Single click on empty plot (no drag)
 *    • Double click
 *    • ESC
 * - Click point toggles service selection (dispatch SET_SELECTED_SERVICE)
 * - Legend items clickable to filter:
 *    • Event legend toggles selectedEventType (dispatch SET_SELECTED_EVENT_TYPE)
 *    • Service legend toggles selectedService (dispatch SET_SELECTED_SERVICE)
 * - Tooltip (singleton, no memory leak)
 *
 * Assumptions about input `data`:
 * - Prefer: data.task3Data (from data_processor_abu.js getTask3Data)
 * - Fallback: data.serviceWeeklyStaff (legacy)
 */

const EVENT_COLORS = {
  none: "#9aa0a6",
  flu: "#e74c3c",
  strike: "#ff7f0e",
  donation: "#1f77b4"
};

const SERVICE_COLORS = {
  Emergency: "#3498db",
  ICU: "#e74c3c",
  Surgery: "#f39c12",
  General_Medicine: "#2ecc71"
};

const SELECT_ORANGE = "#ff8c00";

// -------------------- small normalizers (view-only) --------------------
function normStr(x) {
  return String(x ?? "").trim();
}
function normEvent(x) {
  const e = String(x ?? "").trim().toLowerCase();
  if (!e || e === "normal") return "none";
  if (e.includes("flu") || e.includes("influenza")) return "flu";
  if (e.includes("strike") || e.includes("walkout")) return "strike";
  if (e.includes("donat")) return "donation";
  if (e === "none") return "none";
  return "none";
}
function normServiceLabel(x) {
  const s = String(x ?? "").trim();
  const lower = s.toLowerCase();
  if (lower === "icu") return "ICU";
  if (lower.includes("emerg")) return "Emergency";
  if (lower.includes("surg")) return "Surgery";
  if (lower.includes("general") && lower.includes("med")) return "General_Medicine";
  // already canonical?
  if (SERVICE_COLORS[s]) return s;
  return s;
}
function prettyService(s) {
  return normStr(s).replaceAll("_", " ");
}

// stable ID + stable hash jitter
function pointId(d) {
  // prefer explicit id if present
  if (d.id != null) return String(d.id);

  const w = +d.week;
  const svc = normServiceLabel(d.service);
  const ev = normEvent(d.event ?? d.eventType);
  const x = Number.isFinite(+d.pct_staff_present) ? (+d.pct_staff_present).toFixed(2) : "na";
  const y = Number.isFinite(+d.staff_morale) ? (+d.staff_morale).toFixed(0) : "na";
  const r = Number.isFinite(+d.patients_refused) ? (+d.patients_refused).toFixed(0) : "na";
  return `${w}__${svc}__${ev}__${x}__${y}__${r}`;
}
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function xJitterPx(d, xPct) {
  // deterministic jitter width slightly wider near 0/100
  const baseSpreadPx = 8;
  const extraSpreadPx = 6;
  const extremeBandPct = 10;

  const distToEdge = Math.min(xPct, 100 - xPct);
  const edgeProximity = Math.max(0, 1 - distToEdge / extremeBandPct);
  const spread = baseSpreadPx + extraSpreadPx * edgeProximity;

  const t = hash01(pointId(d)) - 0.5; // -0.5..0.5
  return t * spread;
}

// -------------------- INIT --------------------
export function init(container, globalData, state, dispatch) {
  const el = d3.select(container);

  // preserve panel header if present
  const headerNode = el.select(".panel-header").node();
  el.selectAll("*").remove();
  if (headerNode) el.node().appendChild(headerNode);

  // wrapper
  const wrap = el.append("div")
    .attr("class", "scatter-wrap")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("gap", "8px");

  // controls row
  const controls = wrap.append("div")
    .attr("class", "scatter-controls")
    .style("display", "flex")
    .style("justify-content", "space-between")
    .style("align-items", "center")
    .style("gap", "12px");

  const left = controls.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  left.append("span")
    .style("font-size", "12px")
    .style("color", "#666")
    .text("X:");

  const select = left.append("select")
    .style("font-size", "12px")
    .style("padding", "6px 8px")
    .style("border", "1px solid #ddd")
    .style("border-radius", "6px");

  // right controls
  const right = controls.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "14px");

  const stressWrap = right.append("label")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("cursor", "pointer");

  const stressCheckbox = stressWrap.append("input")
    .attr("type", "checkbox")
    .on("change", function () {
      dispatch({ type: "SET_STRESS_ONLY", value: this.checked });
    });

  stressWrap.append("span").text("Stress-only");

  right.append("span")
    .style("font-size", "12px")
    .style("color", "#888")
    .text("Drag to brush • Click point/service to select • Click event to filter");

  // subtitle
  const subtitle = wrap.append("div")
    .attr("class", "scatter-subtitle")
    .style("font-size", "12px")
    .style("color", "#666");

  // chart
  const margin = { top: 18, right: 18, bottom: 42, left: 62 };
  const viewW = 1000;
  const plotH = 300; // requested ~300px
  const svgH = plotH + margin.top + margin.bottom;

  const svg = wrap.append("svg")
    .attr("class", "scatter-svg")
    .style("width", "100%")
    .style("height", `${svgH}px`)
    .attr("viewBox", `0 0 ${viewW} ${svgH}`);

  const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const width = viewW - margin.left - margin.right;
  const height = plotH;

  // layers
  const gridLayer = root.append("g").attr("class", "grid-layer");
  const axesLayer = root.append("g").attr("class", "axes-layer");
  const brushLayer = root.append("g").attr("class", "brush-layer");
  const pointsLayer = root.append("g").attr("class", "points-layer");
  const uiLayer = root.append("g").attr("class", "ui-layer");

  // axes groups
  axesLayer.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  axesLayer.append("g").attr("class", "y-axis");
  axesLayer.append("text")
    .attr("class", "x-label")
    .attr("x", width / 2)
    .attr("y", height + 34)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "600")
    .style("fill", "#2d3436");

  axesLayer.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -48)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "600")
    .style("fill", "#2d3436");

  // state stored on container
  container._scatter = {
    dispatch,
    select,
    stressCheckbox,
    subtitle,
    svg,
    root,
    width,
    height,
    margin,
    gridLayer,
    axesLayer,
    brushLayer,
    pointsLayer,
    uiLayer,
    xVar: null,
    selectionIds: new Set(),
    tooltipEl: null,
    keyHandlerAttached: false
  };

  // dropdown options based on data keys
  populateCompositionDropdown(container, globalData);

  select.on("change", function () {
    container._scatter.xVar = this.value;
    update(container, globalData, state, dispatch);
  });

  update(container, globalData, state, dispatch);
}

// -------------------- UPDATE --------------------
export function update(container, globalData, state, dispatch) {
  const refs = container._scatter;
  if (!refs) return;

  // sync checkbox
  refs.stressCheckbox.property("checked", !!state.stressOnly);

  const metric = state.metric || "refusals";
  const metricLabel = {
    refusals: "Patient Refusals",
    morale: "Staff Morale",
    occupancy: "Occupancy",
    satisfaction: "Patient Satisfaction"
  }[metric] || metric;

  // pull best dataset
  const raw =
    Array.isArray(globalData?.task3Data) ? globalData.task3Data :
    Array.isArray(globalData?.serviceWeeklyStaff) ? globalData.serviceWeeklyStaff :
    [];

  // adapt rows into one consistent shape
  const rows = raw.map(d => {
    const service = normServiceLabel(d.service);
    const event = normEvent(d.event ?? d.eventType);

    // metric fields (legacy compatibility)
    const refusals = Number.isFinite(+d.patients_refused) ? +d.patients_refused : +d.refusals;
    const morale = Number.isFinite(+d.staff_morale) ? +d.staff_morale : +d.morale;
    const occupancy = Number.isFinite(+d.occupancy) ? +d.occupancy : +d.occ;
    const satisfaction = Number.isFinite(+d.patient_satisfaction) ? +d.patient_satisfaction : +d.satisfaction;

    // composition fields:
    // ABU scatter uses pct_staff_present; legacy uses pctDoctor/pctNurse/etc.
    const pct_staff_present = Number.isFinite(+d.pct_staff_present) ? +d.pct_staff_present : undefined;

    return {
      ...d,
      service,
      event,
      week: +d.week,
      refusals,
      morale,
      occupancy,
      satisfaction,
      pct_staff_present
    };
  });

  refs.gridLayer.selectAll("*").remove();
  refs.axesLayer.selectAll(".x-axis > *").remove();
  refs.axesLayer.selectAll(".y-axis > *").remove();
  refs.pointsLayer.selectAll("*").remove();
  refs.brushLayer.selectAll("*").remove();
  refs.uiLayer.selectAll("*").remove();

  if (!rows.length) {
    refs.subtitle.text("No data available for scatter.");
    return;
  }

  // choose x variable (default = pct_staff_present if present, else first pct* key)
  if (!refs.xVar) {
    const hasPctStaff = rows.some(d => Number.isFinite(+d.pct_staff_present));
    refs.xVar = hasPctStaff ? "pct_staff_present" : refs.select.select("option")?.node()?.value || null;
    if (refs.xVar) refs.select.property("value", refs.xVar);
  }
  const xVar = refs.xVar;

  // stress predicate (use ABU stress_level if present, else heuristic)
  const isStress = (d) => {
    if (d.stress_level) return String(d.stress_level).toLowerCase() === "high";
    const occ = +d.occupancy;
    const ref = +d.refusals;
    const mor = +d.morale;
    return (Number.isFinite(occ) && occ >= 0.9) ||
      (Number.isFinite(ref) && ref >= 60) ||
      (Number.isFinite(mor) && mor <= 65);
  };

  // apply global filters
  let filtered = rows.filter(d => {
    if (!Number.isFinite(+d.week)) return false;

    if (state.timeRange && (+d.week < +state.timeRange[0] || +d.week > +state.timeRange[1])) return false;

    // event filter uses state.selectedEventType (case-insensitive)
    if (state.selectedEventType) {
      if (normEvent(d.event) !== normEvent(state.selectedEventType)) return false;
    }

    if (state.stressOnly && !isStress(d)) return false;

    // x field must exist
    if (!xVar || !Number.isFinite(+d[xVar])) return false;

    // y metric value must exist
    const yVal =
      metric === "refusals" ? +d.refusals :
      metric === "morale" ? +d.morale :
      metric === "occupancy" ? +d.occupancy :
      metric === "satisfaction" ? +d.satisfaction :
      +d[metric];

    if (!Number.isFinite(yVal)) return false;
    return true;
  });

  if (!filtered.length) {
    refs.subtitle.text("No points match the current filters (try clearing filters).");
    return;
  }

  // subtitle
  refs.subtitle.text(
    `${metricLabel} vs ${xVar}` +
    (state.stressOnly ? " • stress-only" : "") +
    (state.timeRange ? ` • weeks ${state.timeRange[0]}–${state.timeRange[1]}` : "") +
    (state.selectedEventType ? ` • event=${normEvent(state.selectedEventType)}` : "") +
    (state.selectedService ? ` • service=${prettyService(state.selectedService)}` : "")
  );

  // scales
  const { width, height } = refs;

  // X: if pct_staff_present -> 0..100
  const isPctStaffPresent = xVar === "pct_staff_present";
  const xDomain = isPctStaffPresent
    ? [0, 100]
    : d3.extent(filtered, d => +d[xVar]);

  const x = d3.scaleLinear()
    .domain([xDomain[0] ?? 0, xDomain[1] ?? 1])
    .range([0, width])
    .nice()
    .clamp(true);

  const yAccessor = (d) => {
    if (metric === "refusals") return +d.refusals;
    if (metric === "morale") return +d.morale;
    if (metric === "occupancy") return +d.occupancy;
    if (metric === "satisfaction") return +d.satisfaction;
    return +d[metric];
  };

  const yDomain = d3.extent(filtered, yAccessor);
  const y = d3.scaleLinear()
    .domain([yDomain[0] ?? 0, yDomain[1] ?? 1])
    .range([height, 0])
    .nice()
    .clamp(true);

  // grid
  refs.gridLayer.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(7).tickSize(-height).tickFormat(""))
    .call(g => g.selectAll("line").attr("stroke", "#ecf0f1").attr("stroke-width", 1))
    .call(g => g.select(".domain").remove());

  refs.gridLayer.append("g")
    .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(""))
    .call(g => g.selectAll("line").attr("stroke", "#ecf0f1").attr("stroke-width", 1))
    .call(g => g.select(".domain").remove());

  // axes
  const xTickFmt = isPctStaffPresent ? (d) => `${d}%` : d3.format(".2~s");
  const yTickFmt =
    metric === "occupancy" ? d3.format(".0%") :
    metric === "satisfaction" ? d3.format(".0f") :
    metric === "morale" ? d3.format(".0f") :
    metric === "refusals" ? d3.format(".0f") :
    d3.format(".2~s");

  refs.axesLayer.select(".x-axis")
    .call(d3.axisBottom(x).ticks(7).tickFormat(xTickFmt))
    .selectAll("text").style("font-size", "11px").style("fill", "#666");

  refs.axesLayer.select(".y-axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(yTickFmt))
    .selectAll("text").style("font-size", "11px").style("fill", "#666");

  refs.axesLayer.select(".x-label").text(isPctStaffPresent ? "Staff Present (%)" : xVar);
  refs.axesLayer.select(".y-label").text(metricLabel);

  // tooltip (singleton)
  const getTooltip = () => {
    if (refs.tooltipEl && document.body.contains(refs.tooltipEl.node())) return refs.tooltipEl;
    refs.tooltipEl = d3.select("body").append("div")
      .attr("class", "chart-tooltip")
      .style("position", "fixed")
      .style("pointer-events", "none")
      .style("z-index", "9999")
      .style("opacity", 0)
      .style("background", "#2c3e50")
      .style("color", "white")
      .style("padding", "10px 12px")
      .style("border-radius", "8px")
      .style("font-size", "12px")
      .style("box-shadow", "0 8px 18px rgba(0,0,0,0.22)");
    return refs.tooltipEl;
  };

  const showTooltip = (event, d) => {
    const t = getTooltip();
    const xVal = +d[xVar];
    const yVal = yAccessor(d);

    t.html(`
      <div style="font-weight:700; margin-bottom:6px;">
        ${prettyService(d.service)} • Week ${d.week}
      </div>
      <div style="color:#cbd5e1;">
        Event: <b style="color:#fff">${normEvent(d.event)}</b><br/>
        ${isPctStaffPresent ? "Staff Present" : xVar}: <b style="color:#fff">${isPctStaffPresent ? `${xVal.toFixed(1)}%` : xVal.toFixed(3)}</b><br/>
        ${metricLabel}: <b style="color:#fff">${metric === "occupancy" ? d3.format(".1%")(yVal) : yVal.toFixed(2)}</b><br/>
        Refusals: <b style="color:#fff">${(+d.refusals).toFixed(0)}</b> •
        Morale: <b style="color:#fff">${(+d.morale).toFixed(0)}</b> •
        Occ: <b style="color:#fff">${d3.format(".1%")(+d.occupancy)}</b> •
        Satisfaction: <b style="color:#fff">${(+d.satisfaction).toFixed(0)}</b>
      </div>
    `).style("opacity", 1);

    t.style("left", `${(event.pageX ?? event.clientX) + 12}px`)
      .style("top", `${(event.pageY ?? event.clientY) + 12}px`);
  };

  const moveTooltip = (event) => {
    if (!refs.tooltipEl) return;
    refs.tooltipEl
      .style("left", `${(event.pageX ?? event.clientX) + 12}px`)
      .style("top", `${(event.pageY ?? event.clientY) + 12}px`);
  };

  const hideTooltip = () => {
    if (refs.tooltipEl) refs.tooltipEl.style("opacity", 0);
  };

  // selection helpers
  const hasSelection = () => refs.selectionIds && refs.selectionIds.size > 0;
  const isSelected = (d) => refs.selectionIds.has(pointId(d));

  const renderPointStyles = () => {
    refs.pointsLayer.selectAll("circle.point")
      .style("opacity", d => {
        // link selected service (from global state)
        const serviceMatch = state.selectedService ? (String(d.service) === String(state.selectedService)) : true;

        // if brush selection exists, only selected are strong
        if (hasSelection()) {
          if (!isSelected(d)) return 0.08;
          return serviceMatch ? 0.75 : 0.18;
        }

        return serviceMatch ? 0.6 : 0.14;
      })
      .style("stroke", d => {
        if (hasSelection() && isSelected(d)) return SELECT_ORANGE;
        // otherwise subtle service stroke
        return SERVICE_COLORS[d.service] || "#ffffff";
      })
      .style("stroke-width", d => (hasSelection() && isSelected(d)) ? 2.5 : 1.4)
      .style("filter", d => (hasSelection() && isSelected(d)) ? "drop-shadow(0 0 2px rgba(255,140,0,0.45))" : "none");
  };

  const clearSelection = () => {
    refs.selectionIds = new Set();
    refs.brushLayer.selectAll(".brush-rect").remove();
    renderPointStyles();
  };

  // ESC to clear (attach once)
  if (!refs.keyHandlerAttached) {
    refs.keyHandlerAttached = true;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") clearSelection();
    });
  }

  // points with deterministic jitter (only when x is pct_staff_present; otherwise tiny)
  const points = filtered.map(d => {
    const xVal = +d[xVar];
    const xPx = x(xVal);
    const jitterPx = isPctStaffPresent ? xJitterPx(d, xVal) : ((hash01(pointId(d)) - 0.5) * 4);
    return { ...d, __xPx: xPx + jitterPx, __yPx: y(yAccessor(d)) };
  });

  // draw points
  refs.pointsLayer.selectAll("circle.point")
    .data(points, d => pointId(d))
    .join("circle")
    .attr("class", "point")
    .attr("cx", d => d.__xPx)
    .attr("cy", d => d.__yPx)
    .attr("r", 3.2)
    .attr("fill", d => EVENT_COLORS[normEvent(d.event)] || EVENT_COLORS.none)
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      d3.select(this).style("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.35))");
      showTooltip(event, d);
    })
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseleave", function () {
      d3.select(this).style("filter", "none");
      hideTooltip();
      renderPointStyles();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      // toggle service selection
      const svc = d.service;
      dispatch({ type: "SET_SELECTED_SERVICE", value: svc });
    });

  renderPointStyles();

  // -------------------- brush (custom rectangle brush like your linked version) --------------------
  const brushState = { start: null, moved: false };

  // background to catch clicks
  const bg = refs.brushLayer.append("rect")
    .attr("class", "brush-bg")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "transparent")
    .style("cursor", "crosshair");

  bg.on("click", () => {
    if (!brushState.moved) clearSelection();
  });
  bg.on("dblclick", () => clearSelection());

  bg.call(
    d3.drag()
      .on("start", (event) => {
        brushState.start = d3.pointer(event, refs.root.node());
        brushState.moved = false;
        refs.brushLayer.selectAll(".brush-rect").remove();
      })
      .on("drag", (event) => {
        const p = d3.pointer(event, refs.root.node());
        const dx = p[0] - brushState.start[0];
        const dy = p[1] - brushState.start[1];
        if (dx * dx + dy * dy > 9) brushState.moved = true;

        const x0 = Math.max(0, Math.min(brushState.start[0], p[0]));
        const x1 = Math.min(width, Math.max(brushState.start[0], p[0]));
        const y0 = Math.max(0, Math.min(brushState.start[1], p[1]));
        const y1 = Math.min(height, Math.max(brushState.start[1], p[1]));

        refs.brushLayer.selectAll(".brush-rect").remove();
        refs.brushLayer.append("rect")
          .attr("class", "brush-rect")
          .attr("x", x0)
          .attr("y", y0)
          .attr("width", x1 - x0)
          .attr("height", y1 - y0)
          .style("fill", SELECT_ORANGE)
          .style("fill-opacity", 0.14)
          .style("stroke", SELECT_ORANGE)
          .style("stroke-width", 2);

        const selected = new Set();
        for (const d of points) {
          if (d.__xPx >= x0 && d.__xPx <= x1 && d.__yPx >= y0 && d.__yPx <= y1) {
            selected.add(pointId(d));
          }
        }
        refs.selectionIds = selected;
        renderPointStyles();
      })
      .on("end", () => {
        refs.brushLayer.selectAll(".brush-rect").remove();

        if (hasSelection()) {
          const weeks = [];
          for (const d of points) {
            if (refs.selectionIds.has(pointId(d))) weeks.push(+d.week);
          }
          const minW = d3.min(weeks);
          const maxW = d3.max(weeks);
          if (Number.isFinite(minW) && Number.isFinite(maxW)) {
            dispatch({ type: "SET_TIME_RANGE", value: [minW, maxW] });
          }
        }
      })
  );

  // -------------------- Clear button (inside plot) --------------------
  const clearBtn = refs.uiLayer.append("g")
    .attr("transform", `translate(${width - 110}, -6)`)
    .style("cursor", "pointer")
    .on("click", (event) => {
      event.stopPropagation();
      clearSelection();
    });

  clearBtn.append("rect")
    .attr("width", 105)
    .attr("height", 22)
    .attr("rx", 6)
    .attr("ry", 6)
    .style("fill", "#ffffff")
    .style("stroke", "#d0d7de")
    .style("stroke-width", 1);

  clearBtn.append("text")
    .attr("x", 52.5)
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("font-weight", "700")
    .style("fill", "#2d3436")
    .text("Clear brush");

  // -------------------- Interactive legend --------------------
  // Events legend: toggles selectedEventType
  const legendY = height + 10;
  const legend = refs.uiLayer.append("g").attr("transform", `translate(0,${legendY})`);

  const events = ["donation", "flu", "strike", "none"];
  const eventLegend = legend.append("g").attr("class", "legend-events");

  eventLegend.append("text")
    .attr("x", 0)
    .attr("y", 26)
    .style("font-size", "11px")
    .style("fill", "#666")
    .text("Event:");

  const evItems = eventLegend.selectAll("g.ev")
    .data(events)
    .join("g")
    .attr("class", "ev")
    .attr("transform", (d, i) => `translate(${50 + i * 92}, 14)`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();
      const cur = state.selectedEventType ? normEvent(state.selectedEventType) : null;
      dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: (cur === d ? null : d) });
    });

  evItems.append("circle")
    .attr("cx", 0)
    .attr("cy", 10)
    .attr("r", 5)
    .attr("fill", d => EVENT_COLORS[d] || EVENT_COLORS.none)
    .attr("stroke", d => {
      const cur = state.selectedEventType ? normEvent(state.selectedEventType) : null;
      return (cur === d) ? SELECT_ORANGE : "#ffffff";
    })
    .attr("stroke-width", d => {
      const cur = state.selectedEventType ? normEvent(state.selectedEventType) : null;
      return (cur === d) ? 2 : 1;
    });

  evItems.append("text")
    .attr("x", 10)
    .attr("y", 14)
    .style("font-size", "11px")
    .style("fill", "#2d3436")
    .text(d => d);

  // Services legend: toggles selectedService
  const services = Object.keys(SERVICE_COLORS);
  const svcLegend = legend.append("g").attr("class", "legend-services").attr("transform", `translate(0,40)`);

  svcLegend.append("text")
    .attr("x", 0)
    .attr("y", 14)
    .style("font-size", "11px")
    .style("fill", "#666")
    .text("Service:");

  const svcItems = svcLegend.selectAll("g.svc")
    .data(services)
    .join("g")
    .attr("class", "svc")
    .attr("transform", (d, i) => `translate(${60 + i * 130}, 2)`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();
      const cur = state.selectedService ? String(state.selectedService) : null;
      dispatch({ type: "SET_SELECTED_SERVICE", value: (cur === d ? null : d) });
    });

  svcItems.append("rect")
    .attr("x", 0)
    .attr("y", 4)
    .attr("width", 12)
    .attr("height", 12)
    .attr("rx", 3)
    .attr("ry", 3)
    .attr("fill", "#fff")
    .attr("stroke", d => {
      const cur = state.selectedService ? String(state.selectedService) : null;
      return (cur === d) ? SELECT_ORANGE : (SERVICE_COLORS[d] || "#bbb");
    })
    .attr("stroke-width", d => {
      const cur = state.selectedService ? String(state.selectedService) : null;
      return (cur === d) ? 2.5 : 2;
    });

  svcItems.append("text")
    .attr("x", 18)
    .attr("y", 15)
    .style("font-size", "11px")
    .style("fill", "#2d3436")
    .text(d => prettyService(d));

  // end: hide tooltip if mouse leaves chart
  refs.svg.on("mouseleave", hideTooltip);
}

// -------------------- Dropdown: pct* fields + pct_staff_present --------------------
function populateCompositionDropdown(container, globalData) {
  const refs = container._scatter;
  const select = refs.select;

  const raw =
    Array.isArray(globalData?.task3Data) ? globalData.task3Data :
    Array.isArray(globalData?.serviceWeeklyStaff) ? globalData.serviceWeeklyStaff :
    [];

  const sample = raw[0] || {};
  const keys = Object.keys(sample);

  // Always include pct_staff_present if present or likely for your task
  const fields = [];
  if (keys.includes("pct_staff_present")) fields.push("pct_staff_present");

  // include pct* composition fields
  const pctFields = keys.filter(k => k.startsWith("pct") && k !== "pct_staff_present").sort();
  for (const k of pctFields) fields.push(k);

  // fallback if nothing exists
  if (!fields.length) fields.push("pct_staff_present");

  select.selectAll("option")
    .data(fields)
    .join("option")
    .attr("value", d => d)
    .text(d => (d === "pct_staff_present" ? "pct_staff_present (staff present %)" : d));

  // default selection
  refs.xVar = fields[0];
  select.property("value", refs.xVar);
}
