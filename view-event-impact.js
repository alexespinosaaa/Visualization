import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Event Impact Distribution Panel
 * Violin plot + stable jitter + median/mean
 *
 * IMPORTANT:
 * - This view expects: data.serviceWeekly (service-week rows)
 * - It uses state.metric as the metric to plot (same behavior as before)
 * - It fills the panel using flex + clientWidth/clientHeight like PCP/Scatter
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  container._evState = { dispatch };

  const wrapper = el.append("div")
    .attr("class", "eventimpact-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");

  wrapper.append("div")
    .attr("class", "eventimpact-controls")
    .style("padding", "12px 14px")
    .style("background", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div style="display:flex; align-items:center; justify-content:space-between; gap:14px;">
        <div>
          <div style="font-weight:900; color:#2c3e50; font-size:13px;">3. Event Impact</div>
          <div class="eventimpact-sub" style="color:#7f8c8d; font-size:12px; margin-top:2px;">
            Distribution shifts inside the selected time window • Click panel to filter
          </div>
        </div>
      </div>
    `);

  wrapper.append("svg")
    .attr("class", "eventimpact-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("min-height", "0")
    .style("display", "block");

  update(container, data, state, dispatch);
}

export function update(container, data, state, dispatch) {
  try {
    if (dispatch) container._evState.dispatch = dispatch;
    const _dispatch = container._evState.dispatch || window.dispatch;

    const rows = (data && data.serviceWeekly) ? data.serviceWeekly : [];
    if (!rows.length) return;

    const svg = d3.select(container).select("svg.eventimpact-chart");
    if (svg.empty()) return;

    const svgNode = svg.node();
    const W = Math.max(320, svgNode.clientWidth || 900);
    const H = Math.max(280, svgNode.clientHeight || 420);

    const margin = { top: 24, right: 18, bottom: 34, left: 60 };
    const width = Math.max(10, W - margin.left - margin.right);
    const height = Math.max(10, H - margin.top - margin.bottom);

    svg.selectAll("*").remove();

    const root = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const metric = state.metric || "refusals";
    const metricLabel = {
      refusals: "Patient Refusals",
      morale: "Staff Morale",
      occupancy: "Occupancy",
      satisfaction: "Patient Satisfaction"
    }[metric] || metric;

    // Update subtitle text (in controls)
    d3.select(container).select(".eventimpact-sub")
      .text(
        state.timeRange
          ? `Distribution by event • ${metricLabel} (Weeks ${state.timeRange[0]}–${state.timeRange[1]}) • Click to filter`
          : `Distribution by event • ${metricLabel} • Click to filter`
      );

    // Filter rows by timeRange (if any)
    const filtered = rows.filter(d => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return false;
      return Number.isFinite(+d[metric]);
    });

    if (!filtered.length) return;

    // Unique event types
    const eventTypes = Array.from(new Set(filtered.map(d => d.eventType))).sort();
    if (!eventTypes.length) return;

    // Y scale over all events
    const y = d3.scaleLinear()
      .domain(d3.extent(filtered, d => +d[metric]))
      .nice()
      .range([height, 0]);

    root.append("g")
      .call(d3.axisLeft(y).ticks(6))
      .selectAll("text")
      .style("font-size", "11px");

    // Panel layout (small multiples)
    const cols = Math.min(4, eventTypes.length);
    const rowsN = Math.ceil(eventTypes.length / cols);
    const panelW = width / cols - 16;
    const panelH = height / rowsN - 18;

    const colorMap = {
      flu: "#9b59b6",
      strike: "#e67e22",
      donation: "#3498db",
      none: "#b2bec3"
    };

    const chartGroup = root.append("g");

    const panels = chartGroup.selectAll(".panel")
      .data(eventTypes, d => d)
      .join("g")
      .attr("class", "panel")
      .attr("transform", (d, i) =>
        `translate(${(i % cols) * (panelW + 16)}, ${Math.floor(i / cols) * (panelH + 18)})`
      )
      .style("cursor", "pointer")
      .style("opacity", d => (state.selectedEventType && d !== state.selectedEventType) ? 0.35 : 1)
      .on("click", (e, d) => {
        _dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: d });
      });

    panels.each(function(eventType) {
      const g = d3.select(this);
      g.selectAll("*").remove();

      const rowsForEvent = filtered.filter(d => d.eventType === eventType);
      const values = rowsForEvent.map(d => +d[metric]);

      const uniqueWeeks = new Set(rowsForEvent.map(d => +d.week)).size;
      const color = colorMap[eventType] || "#999";

      // Header labels
      g.append("text")
        .attr("x", 6)
        .attr("y", 14)
        .style("font-weight", "800")
        .style("font-size", "12px")
        .style("fill", color)
        .text(String(eventType).toUpperCase());

      g.append("text")
        .attr("x", 6)
        .attr("y", 30)
        .style("font-size", "11px")
        .style("fill", "#666")
        .text(`${uniqueWeeks} weeks`);

      if (values.length < 2) return;

      // Panel-local Y scale (maps global y-domain into local panel space)
      const yPanel = y.copy().range([panelH - 10, 40]);

      // KDE for violin
      const kde = kernelDensityEstimator(kernelEpanechnikov(7), y.ticks(40));
      const density = kde(values);

      const xDensity = d3.scaleLinear()
        .domain([0, d3.max(density, d => d[1])])
        .range([0, panelW / 2 - 12]);

      // Violin shape
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

      // Stable jitter points
      g.selectAll("circle.point")
        .data(values.map((v, i) => ({ v, i })))
        .join("circle")
        .attr("class", "point")
        .attr("cx", d => panelW / 2 + ((d.i * 37) % 10 - 5))
        .attr("cy", d => yPanel(d.v))
        .attr("r", 3)
        .attr("fill", color)
        .attr("opacity", 0.6);

      // Median + mean
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

  } catch (err) {
    console.error("❌ Error in view-event-impact update:", err);
  }
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
