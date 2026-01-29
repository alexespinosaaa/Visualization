// view-event-impact.js (RESPONSIVE: fills panel, no fixed 1100x280)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getInnerSize, ensureSVG, observeResize } from "./viz-utils.js";

/**
 * Event Impact Distribution Panel
 * Violin plot + stable jittered scatter + median/mean
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 30, left: 55 };
  const svg = ensureSVG(el);

  container._ev = { margin, dispatch };

  container._ev_ro = observeResize(container, () => {
    update(container, data, state, dispatch);
  });

  update(container, data, state, dispatch);
}

export function update(container, data, state, dispatch) {
  const el = d3.select(container);
  const cfg = container._ev;
  if (!cfg) return;

  const rows = data.serviceWeekly || [];
  if (!rows.length) return;

  const margin = cfg.margin;
  const { width, height } = getInnerSize(container, margin, 300);

  const svg = el.select("svg");
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const root = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const subtitle = root.append("text")
    .attr("y", -6)
    .style("font-size", "12px")
    .style("fill", "#666");

  const chartGroup = root.append("g");

  const metric = state.metric || "refusals";
  const metricLabel = {
    refusals: "Patient Refusals",
    morale: "Staff Morale",
    occupancy: "Occupancy",
    satisfaction: "Patient Satisfaction"
  }[metric] || metric;

  subtitle.text(
    state.timeRange
      ? `Distribution by event • ${metricLabel} (Weeks ${state.timeRange[0]}–${state.timeRange[1]})`
      : `Distribution by event • ${metricLabel}`
  );

  const filtered = rows.filter(d => {
    if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
    if (!Number.isFinite(+d[metric])) return false;
    return true;
  });

  const eventTypes = Array.from(new Set(filtered.map(d => d.eventType))).sort();
  if (!eventTypes.length) return;

  const y = d3.scaleLinear()
    .domain(d3.extent(filtered, d => +d[metric]))
    .nice()
    .range([height, 0]);

  root.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(y).ticks(5))
    .selectAll("text")
    .style("font-size", "11px");

  const cols = Math.min(4, eventTypes.length);
  const rowsN = Math.ceil(eventTypes.length / cols);
  const panelW = width / cols - 14;
  const panelH = height / rowsN - 18;

  const colorMap = {
    flu: "#9b59b6",
    strike: "#e67e22",
    donation: "#3498db",
    none: "#b2bec3"
  };

  const panels = chartGroup.selectAll(".panel")
    .data(eventTypes)
    .join("g")
    .attr("class", "panel")
    .attr("transform", (d, i) =>
      `translate(${(i % cols) * (panelW + 14)}, ${Math.floor(i / cols) * (panelH + 18)})`
    );

  panels.each(function(eventType) {
    const g = d3.select(this);
    g.selectAll("*").remove();

    const rowsForEvent = filtered.filter(d => d.eventType === eventType);
    const values = rowsForEvent.map(d => +d[metric]);
    const uniqueWeeks = new Set(rowsForEvent.map(d => +d.week)).size;

    const color = colorMap[eventType] || "#999";

    g.append("text")
      .attr("x", 6)
      .attr("y", 14)
      .style("font-weight", "700")
      .style("font-size", "12px")
      .style("fill", color)
      .text(eventType.toUpperCase());

    g.append("text")
      .attr("x", 6)
      .attr("y", 30)
      .style("font-size", "11px")
      .style("fill", "#666")
      .text(`${uniqueWeeks} weeks`);

    if (values.length < 2) return;

    const yPanel = y.copy().range([panelH - 10, 40]);

    const kde = kernelDensityEstimator(kernelEpanechnikov(7), y.ticks(40));
    const density = kde(values);

    const xDensity = d3.scaleLinear()
      .domain([0, d3.max(density, d => d[1])])
      .range([0, panelW / 2 - 10]);

    g.append("path")
      .datum(density)
      .attr("fill", color)
      .attr("opacity", 0.25)
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("d", d3.area()
        .curve(d3.curveCatmullRom)
        .x0(d => panelW / 2 - xDensity(d[1]))
        .x1(d => panelW / 2 + xDensity(d[1]))
        .y(d => yPanel(d[0]))
      );

    // stable jitter
    g.selectAll("circle.point")
      .data(values.map((v, i) => ({ v, i })))
      .join("circle")
      .attr("class", "point")
      .attr("cx", d => panelW / 2 + ((d.i * 37) % 10 - 5))
      .attr("cy", d => yPanel(d.v))
      .attr("r", 3)
      .attr("fill", color)
      .attr("opacity", 0.6);

    const median = d3.median(values);
    const mean = d3.mean(values);

    g.append("line")
      .attr("x1", panelW / 2 - 12)
      .attr("x2", panelW / 2 + 12)
      .attr("y1", yPanel(median))
      .attr("y2", yPanel(median))
      .attr("stroke", color)
      .attr("stroke-width", 3);

    g.append("circle")
      .attr("cx", panelW / 2)
      .attr("cy", yPanel(mean))
      .attr("r", 4)
      .attr("fill", color)
      .attr("stroke", "white")
      .attr("stroke-width", 1.5);
  });

  panels
    .style("opacity", d => state.selectedEventType && d !== state.selectedEventType ? 0.35 : 1)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      // toggle is handled by your main dispatch logic (same value clears)
      dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: d });
    });
}

// KDE helpers
function kernelDensityEstimator(kernel, X) {
  return function (V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
  };
}
function kernelEpanechnikov(k) {
  return function (v) {
    v /= k;
    return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}
