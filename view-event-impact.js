// view-event-impact.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Event Impact Distribution Panel
 * Violin plot + stable jittered scatter + median/mean
 *
 * Fixes:
 *  - "weeks" label now counts UNIQUE weeks per event type (not service-week rows)
 *  - Removed redundant hover tooltip on panels
 *  - Stable (deterministic) jitter so points do not move between renders
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 30, left: 55 };
  const width = 1100 - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = el.append("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const root = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const subtitle = root.append("text")
    .attr("y", -6)
    .style("font-size", "12px")
    .style("fill", "#666");

  const chartGroup = root.append("g");

  container.refs = { root, chartGroup, subtitle, width, height, dispatch };
}

export function update(container, data, state) {
  const { root, chartGroup, subtitle, width, height, dispatch } = container.refs;
  const rows = data.serviceWeekly || [];

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
  chartGroup.selectAll("*").remove();
  if (!eventTypes.length) return;

  const y = d3.scaleLinear()
    .domain(d3.extent(filtered, d => +d[metric]))
    .nice()
    .range([height, 0]);

  root.selectAll(".y-axis").remove();
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

    // Keep the raw rows for this event type (so we can count unique weeks correctly)
    const rowsForEvent = filtered.filter(d => d.eventType === eventType);

    // Values used for violin/scatter
    const values = rowsForEvent.map(d => +d[metric]);

    // Unique week count (FIX)
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

    // If too few samples, don't draw density
    if (values.length < 2) return;

    // KDE density (note: density can look unstable when sample sizes are small)
    const kde = kernelDensityEstimator(kernelEpanechnikov(7), y.ticks(40));
    const density = kde(values);

    const xDensity = d3.scaleLinear()
      .domain([0, d3.max(density, d => d[1])])
      .range([0, panelW / 2 - 10]);

    const yPanel = y.copy().range([panelH - 10, 40]);

    // Violin
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

    // Stable jittered points (deterministic — no moving between updates)
    // We jitter based on the row index in the filtered subset.
    // (Stable across renders for same subset ordering.)
    g.selectAll("circle.point")
      .data(values.map((v, i) => ({ v, i })))
      .join("circle")
      .attr("class", "point")
      .attr("cx", d => panelW / 2 + ((d.i * 37) % 10 - 5))
      .attr("cy", d => yPanel(d.v))
      .attr("r", 3)
      .attr("fill", color)
      .attr("opacity", 0.6);

    // Median and mean
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

  // Selection emphasis + click filter (no hover tooltip)
  panels
    .style("opacity", d =>
      state.selectedEventType && d !== state.selectedEventType ? 0.35 : 1
    )
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      // Dispatcher already toggles selection (same value clears)
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
