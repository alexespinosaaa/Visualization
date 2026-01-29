// view-scatter.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Task 4 — Linked Scatterplot Explorer (Stress-conditioned, linked)
 *
 * Improvements (from summary concepts):
 * - Reduce clutter: smaller marks + transparency + density contours (KDE-like) [file:135][web:151]
 * - Better comparison: gridlines on common scales [file:135]
 * - Linked brushing: brush selects week range (dispatch SET_TIME_RANGE) [file:135][web:4]
 * - Linked selection: click point -> SET_SELECTED_SERVICE [file:1]
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);

  // Preserve panel header if present
  const headerNode = el.select(".panel-header").node();
  el.selectAll("*").remove();
  if (headerNode) el.node().appendChild(headerNode);

  // Controls row
  const controls = el.append("div")
    .style("display", "flex")
    .style("justify-content", "space-between")
    .style("align-items", "center")
    .style("gap", "12px")
    .style("margin", "10px 0 6px 0");

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

  // Stress toggle
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

  // Small hint line
  right.append("span")
    .style("font-size", "12px")
    .style("color", "#888")
    .text("Brush points to set week range • Click point to select service");

  // Caption
  const subtitle = el.append("div")
    .attr("class", "scatter-subtitle")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("margin", "0 0 8px 0");

  const margin = { top: 10, right: 20, bottom: 50, left: 70 };
  const width = 1100 - margin.left - margin.right;
  const height = 360 - margin.top - margin.bottom;

  const svg = el.append("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const root = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  root.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  root.append("g").attr("class", "y-axis");
  root.append("g").attr("class", "x-grid").attr("transform", `translate(0,${height})`);
  root.append("g").attr("class", "y-grid");

  root.append("text")
    .attr("class", "x-label")
    .attr("x", width / 2)
    .attr("y", height + 42)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#2d3436");

  root.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#2d3436");

  const plot = root.append("g").attr("class", "plot");
  const densityG = plot.append("g").attr("class", "density");
  const pointsG = plot.append("g").attr("class", "points");
  const brushG = plot.append("g").attr("class", "brush");

  const tooltip = d3.select("body").select(".chart-tooltip");

  // Brush (rectangle) -> sets time range based on selected points
  const brush = d3.brush()
    .extent([[0, 0], [width, height]])
    .on("end", (event) => {
      if (!event.selection) return;
      const [[x0, y0], [x1, y1]] = event.selection;

      const selected = [];
      pointsG.selectAll("circle.point").each(function (d) {
        const cx = +d3.select(this).attr("cx");
        const cy = +d3.select(this).attr("cy");
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selected.push(d);
      });

      if (selected.length) {
        const minW = d3.min(selected, d => +d.week);
        const maxW = d3.max(selected, d => +d.week);
        dispatch({ type: "SET_TIME_RANGE", value: [minW, maxW] });
      }

      brushG.call(brush.move, null);
    });

  brushG.call(brush);

  container.refs = {
    dispatch,
    svg,
    root,
    plot,
    densityG,
    pointsG,
    brushG,
    brush,
    x,
    y,
    width,
    height,
    margin,
    tooltip,
    select,
    stressCheckbox,
    subtitle,
    xVar: null,
    stateSnapshot: state
  };

  populateCompositionDropdown(container, data);

  // Handle dropdown change
  select.on("change", function () {
    container.refs.xVar = this.value;
    update(container, data, container.refs.stateSnapshot);
  });
}

export function update(container, data, state) {
  const refs = container.refs;
  refs.stateSnapshot = state;

  const { root, densityG, pointsG, x, y, width, height, tooltip, select, stressCheckbox, subtitle } = refs;

  // sync checkbox with state
  stressCheckbox.property("checked", !!state.stressOnly);

  const metric = state.metric || "refusals";
  const metricLabel = {
    refusals: "Patient Refusals",
    morale: "Staff Morale",
    occupancy: "Occupancy",
    satisfaction: "Patient Satisfaction"
  }[metric] || metric;

  const rows = Array.isArray(data.serviceWeeklyStaff) ? data.serviceWeeklyStaff : [];
  densityG.selectAll("*").remove();
  pointsG.selectAll("*").remove();

  if (!rows.length) {
    subtitle.text("No data loaded for scatter.");
    return;
  }

  // choose x variable (default = first option)
  if (!refs.xVar) {
    const opt = select.select("option").node();
    refs.xVar = opt ? opt.value : null;
  }
  const xVar = refs.xVar;

  // Stress predicate (same as earlier, but keep transparent + documented)
  const isStress = (d) => {
    const occ = +d.occupancy;
    const ref = +d.refusals;
    const mor = +d.morale;
    return (Number.isFinite(occ) && occ >= 0.9) ||
      (Number.isFinite(ref) && ref >= 60) ||
      (Number.isFinite(mor) && mor <= 65);
  };

  // Filter by global state
  let filtered = rows.filter(d => {
    const w = +d.week;
    if (state.timeRange && (w < state.timeRange[0] || w > state.timeRange[1])) return false;
    if (state.selectedEventType && d.eventType !== state.selectedEventType) return false;
    if (state.stressOnly && !isStress(d)) return false;

    if (!xVar || !Number.isFinite(+d[xVar])) return false;
    if (!Number.isFinite(+d[metric])) return false;
    return true;
  });

  if (!filtered.length) {
    subtitle.text("No points match the current filters (try relaxing filters).");
    return;
  }

  subtitle.text(
    `${metricLabel} vs ${xVar}` +
    (state.stressOnly ? " • stress-only" : "") +
    (state.timeRange ? ` • weeks ${state.timeRange[0]}–${state.timeRange[1]}` : "") +
    (state.selectedEventType ? ` • event=${state.selectedEventType}` : "") +
    (state.selectedService ? ` • service=${prettyService(state.selectedService)}` : "")
  );

  // Scales
  x.domain(d3.extent(filtered, d => +d[xVar])).nice();
  y.domain(d3.extent(filtered, d => +d[metric])).nice();

  // Axis formatting: X is a percentage
  const pctFmt = d3.format(".0%");
  root.select(".x-axis")
    .call(d3.axisBottom(x).ticks(7).tickFormat(pctFmt))
    .selectAll("text").style("font-size", "11px");

  root.select(".y-axis")
    .call(d3.axisLeft(y).ticks(6))
    .selectAll("text").style("font-size", "11px");

  // Gridlines (improves readability on common scale)
  root.select(".x-grid")
    .call(d3.axisBottom(x).ticks(7).tickSize(-height).tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#ecf0f1")
    .attr("stroke-width", 1);
  root.select(".x-grid").select(".domain").remove();

  root.select(".y-grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#ecf0f1")
    .attr("stroke-width", 1);
  root.select(".y-grid").select(".domain").remove();

  root.select(".x-label").text(xVar);
  root.select(".y-label").text(metricLabel);

  // Color by event type (use d3.schemeTableau10-ish mapping)
  // Keep category color but not too saturated; opacity handles clutter.
  const colorMap = { flu: "#9467bd", strike: "#ff7f0e", donation: "#1f77b4", none: "#9aa0a6" };
  const color = (d) => colorMap[d.eventType] || "#9aa0a6";

  // Slight jitter ONLY to separate the stack at exactly 0% (visual clutter reduction)
  // Keep jitter tiny to not lie about the data too much. [file:135]
  const xSpan = (x.domain()[1] - x.domain()[0]) || 1;
  const jitter = () => (Math.random() - 0.5) * xSpan * 0.0025; // ~0.25% of range

  const points = filtered.map(d => ({
    ...d,
    __x: (+d[xVar] === 0 ? +d[xVar] + jitter() : +d[xVar]),
    __y: +d[metric]
  }));

  // Density contours (KDE-like) to show structure under overplotting
  // This is a direct scalability recommendation for scatterplots. [web:151][file:135]
  const density = d3.contourDensity()
    .x(d => x(d.__x))
    .y(d => y(d.__y))
    .size([width, height])
    .bandwidth(18)(points);

  densityG.selectAll("path")
    .data(density)
    .join("path")
    .attr("d", d3.geoPath())
    .attr("fill", "#74b9ff")
    .attr("opacity", 0.08)
    .attr("stroke", "#74b9ff")
    .attr("stroke-width", 0.8)
    .attr("stroke-opacity", 0.18);

  // Draw points (smaller + alpha)
  const rBase = 3.2;

  pointsG.selectAll("circle.point")
    .data(points, d => `${d.service}_${d.week}_${d.eventType}`)
    .join("circle")
    .attr("class", "point")
    .attr("cx", d => x(d.__x))
    .attr("cy", d => y(d.__y))
    .attr("r", d => (state.selectedWeek && +d.week === +state.selectedWeek) ? 5 : rBase)
    .attr("fill", d => color(d))
    .attr("opacity", d => {
      // strong linking: selected service pops out
      if (state.selectedService && d.service !== state.selectedService) return 0.12;
      return 0.55;
    })
    .attr("stroke", d => (state.selectedService && d.service === state.selectedService) ? "#2d3436" : "white")
    .attr("stroke-width", d => (state.selectedService && d.service === state.selectedService) ? 1.5 : 1)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      refs.dispatch({ type: "SET_SELECTED_SERVICE", value: d.service });
    })
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1)
        .html(`
          <strong>${prettyService(d.service)}</strong> — Week ${d.week}<br>
          <span style="color:#666">Event:</span> ${(d.eventType || "none").toUpperCase()}<br>
          <span style="color:#666">${xVar}:</span> ${d3.format(".1%")(+d[xVar])}<br>
          <span style="color:#666">${metricLabel}:</span> ${fmt(+d[metric], 2)}<br>
          <span style="color:#666">Refusals:</span> ${fmt(+d.refusals, 0)} •
          <span style="color:#666">Morale:</span> ${fmt(+d.morale, 1)} •
          <span style="color:#666">Occ:</span> ${d3.format(".1%")(+d.occupancy)}
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

  // Optional reference line for "typical" outcome (median)
  const medY = d3.median(points, d => d.__y);
  if (Number.isFinite(medY)) {
    pointsG.append("line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", y(medY)).attr("y2", y(medY))
      .attr("stroke", "#636e72")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0.35);
  }
}

// Populate pct* fields
function populateCompositionDropdown(container, data) {
  const refs = container.refs;
  const { select } = refs;

  const rows = Array.isArray(data.serviceWeeklyStaff) ? data.serviceWeeklyStaff : [];
  const sample = rows[0] || {};

  const candidates = Object.keys(sample).filter(k => k.startsWith("pct"));
  const fallback = ["pctDoctor", "pctNurse", "pctSenior", "pctTemp"];

  const fields = candidates.length ? candidates : fallback;

  select.selectAll("option")
    .data(fields)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  refs.xVar = fields[0] || null;
  select.property("value", refs.xVar);
}

// helpers
function fmt(v, digits = 2) {
  const x = +v;
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

function prettyService(s) {
  if (!s) return "—";
  return String(s).replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}
