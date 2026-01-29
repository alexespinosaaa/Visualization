// view-scatter.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Task 4 — Linked Scatterplot Explorer (Stress-Conditioned, Coordinated)
 *
 * Data expected: data.serviceWeeklyStaff (from data_processor_C.js)
 * Fields: week, service, eventType, metric fields, staffPresent, staffPresenceRate, pct<Role>...
 *
 * Mandatory interactions:
 * - Dropdown to choose X composition variable (pctDoctor / pctNurse / ...)
 * - Brush on scatter -> dispatch(SET_TIME_RANGE, [minWeek,maxWeek]) from selected points
 * - Hover tooltip
 * - Stress-only toggle -> dispatch(SET_STRESS_ONLY, true/false)
 *
 * Respects state:
 * - timeRange filters points
 * - selectedService highlights its points
 * - selectedWeek emphasizes points for that week
 * - selectedEventType filters/highlights
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

  // stress toggle
  const right = controls.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px");

  const stressWrap = right.append("label")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("cursor", "pointer");

  const stressCheckbox = stressWrap.append("input")
    .attr("type", "checkbox")
    .on("change", function() {
      dispatch({ type: "SET_STRESS_ONLY", value: this.checked });
    });

  stressWrap.append("span").text("Stress-only");

  // Caption
  const subtitle = el.append("div")
    .attr("class", "scatter-subtitle")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("margin", "0 0 8px 0");

  const margin = { top: 10, right: 20, bottom: 45, left: 60 };
  const width = 1100 - margin.left - margin.right;
  const height = 320 - margin.top - margin.bottom;

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

  root.append("text")
    .attr("class", "x-label")
    .attr("x", width / 2)
    .attr("y", height + 38)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#2d3436");

  root.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#2d3436");

  const plot = root.append("g").attr("class", "plot");
  const brushG = plot.append("g").attr("class", "brush");

  const tooltip = d3.select("body").select(".chart-tooltip");

  // brush definition
  const brush = d3.brush()
    .extent([[0, 0], [width, height]])
    .on("end", (event) => {
      if (!event.selection) return;
      const [[x0, y0], [x1, y1]] = event.selection;

      // Which points are in the brush? (we read their bound data)
      const selected = [];
      plot.selectAll("circle.point").each(function(d) {
        const cx = +d3.select(this).attr("cx");
        const cy = +d3.select(this).attr("cy");
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selected.push(d);
      });

      if (selected.length) {
        const minW = d3.min(selected, d => +d.week);
        const maxW = d3.max(selected, d => +d.week);
        dispatch({ type: "SET_TIME_RANGE", value: [minW, maxW] });
      }

      // clear brush after action
      brushG.call(brush.move, null);
    });

  brushG.call(brush);

  // store refs
  container.refs = {
    dispatch,
    svg,
    root,
    plot,
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

  // Populate dropdown once (based on available pct* fields in the dataset)
  populateCompositionDropdown(container, data);
}

export function update(container, data, state) {
  const refs = container.refs;
  refs.stateSnapshot = state;

  const { root, plot, x, y, width, height, tooltip, select, stressCheckbox, subtitle } = refs;

  // sync checkbox with state
  stressCheckbox.property("checked", !!state.stressOnly);

  const metric = state.metric || "refusals";
  const metricLabel = {
    refusals: "Patient Refusals",
    morale: "Staff Morale",
    occupancy: "Occupancy",
    satisfaction: "Patient Satisfaction"
  }[metric] || metric;

  // dataset
  const rows = Array.isArray(data.serviceWeeklyStaff) ? data.serviceWeeklyStaff : [];
  plot.selectAll("g.points").remove();
  const pointsG = plot.append("g").attr("class", "points");

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

  // Caption
  subtitle.text(
    `${metricLabel} vs ${xVar || "composition"} ` +
    (state.stressOnly ? "• stress-only" : "") +
    (state.timeRange ? ` • weeks ${state.timeRange[0]}–${state.timeRange[1]}` : "") +
    (state.selectedEventType ? ` • event=${state.selectedEventType}` : "")
  );

  // Determine stress predicate (simple + transparent):
  // "stress" = high refusals OR low morale OR high occupancy
  // (No extra fields exist, so we use a rule of thumb.)
  const isStress = (d) => {
    const occ = +d.occupancy;
    const ref = +d.refusals;
    const mor = +d.morale;
    // choose a composite OR rule
    return (Number.isFinite(occ) && occ >= 0.9) ||
           (Number.isFinite(ref) && ref >= 60) ||
           (Number.isFinite(mor) && mor <= 65);
  };

  // Filter by state
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

  // Scales
  x.domain(d3.extent(filtered, d => +d[xVar])).nice();
  y.domain(d3.extent(filtered, d => +d[metric])).nice();

  root.select(".x-axis").call(d3.axisBottom(x).ticks(6).tickFormat(v => (v * 100).toFixed(0) + "%"))
    .selectAll("text").style("font-size", "11px");

  root.select(".y-axis").call(d3.axisLeft(y).ticks(5))
    .selectAll("text").style("font-size", "11px");

  root.select(".x-label").text(xVar);
  root.select(".y-label").text(metricLabel);

  // Color by event type (same palette as your EventImpact view)
  const colorMap = { flu: "#9b59b6", strike: "#e67e22", donation: "#3498db", none: "#b2bec3" };
  const c = (d) => colorMap[d.eventType] || "#999";

  // keyed join (service_week)
  const circles = pointsG.selectAll("circle.point")
    .data(filtered, d => `${d.service}_${d.week}`);

  circles.exit().remove();

  circles.join("circle")
    .attr("class", "point")
    .attr("cx", d => x(+d[xVar]))
    .attr("cy", d => y(+d[metric]))
    .attr("r", d => (state.selectedWeek && +d.week === +state.selectedWeek) ? 6 : 4)
    .attr("fill", d => c(d))
    .attr("opacity", d => {
      if (state.selectedService && d.service !== state.selectedService) return 0.25;
      return 0.75;
    })
    .attr("stroke", d => {
      if (state.selectedService && d.service === state.selectedService) return "#2d3436";
      return "white";
    })
    .attr("stroke-width", d => (state.selectedService && d.service === state.selectedService) ? 1.5 : 1)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1)
        .html(`
          <strong>${prettyService(d.service)}</strong> — Week ${d.week}<br>
          <span style="color:#666">Event:</span> ${(d.eventType || "none").toUpperCase()}<br>
          <span style="color:#666">${xVar}:</span> ${(100 * (+d[xVar])).toFixed(1)}%<br>
          <span style="color:#666">${metricLabel}:</span> ${fmt(+d[metric], 2)}<br>
          <span style="color:#666">Refusals:</span> ${fmt(+d.refusals, 0)}<br>
          <span style="color:#666">Morale:</span> ${fmt(+d.morale, 1)}<br>
          <span style="color:#666">Occupancy:</span> ${(100 * (+d.occupancy)).toFixed(1)}%
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
}

// Populate dropdown options from pct* fields present in data.serviceWeeklyStaff
function populateCompositionDropdown(container, data) {
  const refs = container.refs;
  const rows = Array.isArray(data.serviceWeeklyStaff) ? data.serviceWeeklyStaff : [];

  const pctKeys = rows.length
    ? Object.keys(rows[0]).filter(k => k.startsWith("pct"))
    : [];

  // Fallback if first row doesn't include keys (rare): scan a few rows
  const keys = pctKeys.length ? pctKeys : Array.from(new Set(
    rows.slice(0, 20).flatMap(r => Object.keys(r).filter(k => k.startsWith("pct")))
  )).sort();

  refs.select.selectAll("*").remove();

  if (!keys.length) {
    refs.select.append("option").attr("value", "staffPresenceRate").text("staffPresenceRate");
    refs.xVar = "staffPresenceRate";
  } else {
    keys.forEach(k => {
      refs.select.append("option").attr("value", k).text(k);
    });
    refs.xVar = keys[0];
  }

  refs.select.on("change", function() {
    refs.xVar = this.value;
    update(container, data, refs.stateSnapshot);
  });
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
