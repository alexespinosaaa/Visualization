import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  // Internal state for this view
  container._tsState = {
    dispatch,
    clipId: `timeline-clip-${Math.random().toString(16).slice(2)}`,
    refs: null
  };

  // Wrapper (same pattern as scatter/pcp)
  const wrapper = el.append("div")
    .attr("class", "timeseries-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");

  // Controls row (title + hint)
  wrapper.append("div")
    .attr("class", "timeseries-controls")
    .style("padding", "12px 14px")
    .style("background", "#f8f9fa")
    .style("border-bottom", "1px solid #e0e0e0")
    .html(`
      <div style="display:flex; align-items:center; justify-content:space-between; gap:14px;">
        <div>
          <div style="font-weight:900; color:#2c3e50; font-size:13px;">2. Time Series Focus</div>
          <div style="color:#7f8c8d; font-size:12px; margin-top:2px;">
            Scroll zoom • Drag brush to set week-window • Click to select week
          </div>
        </div>
      </div>
    `);

  // SVG area (fills remaining height)
  const svg = wrapper.append("svg")
    .attr("class", "timeseries-chart")
    .style("width", "100%")
    .style("flex", "1")
    .style("min-height", "0")   // important: let flex compute height
    .style("display", "block");

  // Build static scaffolding once
  _buildScaffold(container, svg);

  update(container, data, state, dispatch);
}

function _buildScaffold(container, svgSel) {
  const clipId = container._tsState.clipId;

  svgSel.selectAll("*").remove();

  // We'll compute margins dynamically in update; store groups here
  svgSel.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("class", "clip-rect");

  const root = svgSel.append("g").attr("class", "root");

  // Labels (top)
  svgSel.append("text")
    .attr("class", "label-left")
    .attr("fill", "#e74c3c")
    .style("font-weight", "bold")
    .style("font-size", "12px")
    .text("← Patient Refusals");

  svgSel.append("text")
    .attr("class", "label-right")
    .attr("fill", "#00b894")
    .style("font-weight", "bold")
    .style("font-size", "12px")
    .style("text-anchor", "end")
    .text("Staff Morale →");

  const chartArea = root.append("g").attr("class", "chartArea");
  const clipped = chartArea.append("g").attr("class", "clipped");

  clipped.append("path").attr("class", "area-refusals")
    .attr("fill", "#e74c3c")
    .attr("fill-opacity", 0.15)
    .attr("stroke", "#e74c3c")
    .attr("stroke-width", 2);

  clipped.append("path").attr("class", "line-morale")
    .attr("fill", "none")
    .attr("stroke", "#00b894")
    .attr("stroke-width", 3);

  clipped.append("g").attr("class", "events");
  clipped.append("g").attr("class", "semantic-dots");

  clipped.append("line").attr("class", "selection-line")
    .attr("stroke", "#2d3436")
    .attr("stroke-width", 2.5)
    .attr("stroke-dasharray", "5 3")
    .style("opacity", 0)
    .style("pointer-events", "none");

  // Axes groups
  chartArea.append("g").attr("class", "x-axis");
  chartArea.append("g").attr("class", "y-axis-l");
  chartArea.append("g").attr("class", "y-axis-r");

  // Brush holder (overlay lives here)
  clipped.append("g").attr("class", "brush");

  // Zoom is attached to SVG in update (needs width/height)
}

export function update(container, data, state, dispatch) {
  try {
    const ds = (data && data.hospitalWeekly) ? data.hospitalWeekly : [];
    if (!ds.length) return;

    // Persist dispatch safely
    if (dispatch) container._tsState.dispatch = dispatch;
    const _dispatch = container._tsState.dispatch || window.dispatch;

    const svg = d3.select(container).select("svg.timeseries-chart");
    if (svg.empty()) return;

    // Measure actual pixels available
    const svgNode = svg.node();
    const W = Math.max(300, svgNode.clientWidth || 900);
    const H = Math.max(260, svgNode.clientHeight || 360);

    // Margins tuned for readability
    const margin = { top: 34, right: 56, bottom: 44, left: 56 };
    const width = Math.max(10, W - margin.left - margin.right);
    const height = Math.max(10, H - margin.top - margin.bottom);

    // Position top labels
    svg.select(".label-left")
      .attr("x", margin.left)
      .attr("y", 18);

    svg.select(".label-right")
      .attr("x", W - margin.right)
      .attr("y", 18);

    // Root translate
    const root = svg.select("g.root")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Clip rect resize + apply
    const clipId = container._tsState.clipId;
    svg.select(`#${clipId} .clip-rect`)
      .attr("width", width)
      .attr("height", height);

    root.select("g.chartArea g.clipped")
      .attr("clip-path", `url(#${clipId})`);

    // Scales
    const x = d3.scaleLinear().domain([1, 52]).range([0, width]);
    const yLeft = d3.scaleLinear().range([height, 0]);
    const yRight = d3.scaleLinear().domain([40, 100]).range([height, 0]);

    const transform = state.zoomTransform || d3.zoomIdentity;
    const newX = transform.rescaleX(x);

    yLeft.domain([0, d3.max(ds, d => +d.refusals) * 1.1]);

    // Axes
    root.select(".x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(newX).ticks(12).tickFormat(d => `W${d}`));

    root.select(".y-axis-l")
      .call(d3.axisLeft(yLeft).ticks(6));

    root.select(".y-axis-r")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yRight).ticks(6));

    // Paths
    const area = d3.area()
      .x(d => newX(+d.week))
      .y0(height)
      .y1(d => yLeft(+d.refusals))
      .curve(d3.curveMonotoneX);

    const line = d3.line()
      .x(d => newX(+d.week))
      .y(d => yRight(+d.morale))
      .curve(d3.curveMonotoneX);

    const clipped = root.select("g.chartArea g.clipped");

    clipped.select("path.area-refusals").datum(ds).attr("d", area);
    clipped.select("path.line-morale").datum(ds).attr("d", line);

    // Selection line
    const selectionLine = clipped.select("line.selection-line");
    if (state.selectedWeek) {
      selectionLine
        .attr("x1", newX(state.selectedWeek))
        .attr("x2", newX(state.selectedWeek))
        .attr("y1", 0)
        .attr("y2", height)
        .style("opacity", 1);
    } else {
      selectionLine.style("opacity", 0);
    }

    // Event icons
    const tooltip = d3.select("body").select(".chart-tooltip");
    const eventGroup = clipped.select("g.events");

    const events = ds.filter(d => d.eventType && d.eventType !== "none");
    const icons = eventGroup.selectAll("g.event-icon")
      .data(events, d => d.week);

    const iconsEnter = icons.enter()
      .append("g")
      .attr("class", "event-icon")
      .style("cursor", "pointer");

    iconsEnter.merge(icons)
      .attr("transform", d => `translate(${newX(+d.week)}, 22)`)
      .style("opacity", d => (state.selectedEventType && d.eventType !== state.selectedEventType) ? 0.12 : 1)
      .on("click", (e, d) => {
        e.stopPropagation();
        const newVal = (state.selectedEventType === d.eventType) ? null : d.eventType;
        _dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: newVal });
      })
      .on("mouseover", (e, d) => {
        tooltip.style("opacity", 1)
          .html(`<strong>${String(d.eventType).toUpperCase()}</strong>`)
          .style("left", (e.pageX + 10) + "px")
          .style("top", (e.pageY - 20) + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0))
      .each(function(d) {
        const g = d3.select(this);
        g.selectAll("*").remove();

        let color = "#95a5a6";
        if (d.eventType === "flu") color = "#9b59b6";
        if (d.eventType === "strike") color = "#e67e22";
        if (d.eventType === "donation") color = "#3498db";

        if (d.eventType === "strike") {
          g.append("path")
            .attr("d", d3.symbol().type(d3.symbolDiamond).size(150))
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
        } else if (d.eventType === "donation") {
          g.append("rect")
            .attr("width", 12).attr("height", 12)
            .attr("x", -6).attr("y", -6)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
        } else {
          g.append("circle")
            .attr("r", 7)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
        }
      });

    icons.exit().remove();

    // Semantic dots (zoom)
    const dots = clipped.select("g.semantic-dots");
    if (transform.k > 2) {
      dots.selectAll("circle")
        .data(ds, d => d.week)
        .join("circle")
        .attr("cx", d => newX(+d.week))
        .attr("cy", d => yRight(+d.morale))
        .attr("r", 4)
        .attr("fill", "white")
        .attr("stroke", "#00b894")
        .attr("stroke-width", 2);
    } else {
      dots.selectAll("circle").remove();
    }

    // Brush (uses NEWX)
    const brushGroup = clipped.select("g.brush");
    brushGroup.selectAll("*").remove();

    const brush = d3.brushX()
      .extent([[0, 0], [width, height]])
      .on("end", (event) => {
        if (!event.sourceEvent) return;
        if (!event.selection) {
          _dispatch({ type: "SET_TIME_RANGE", value: null });
          return;
        }
        const [x0, x1] = event.selection;
        const w1 = Math.max(1, Math.min(52, Math.round(newX.invert(x0))));
        const w2 = Math.max(1, Math.min(52, Math.round(newX.invert(x1))));
        _dispatch({ type: "SET_TIME_RANGE", value: [Math.min(w1, w2), Math.max(w1, w2)] });
      });

    brushGroup.call(brush);

    // Click to select week (attach to overlay)
    brushGroup.select(".overlay")
      .style("cursor", "pointer")
      .on("click", (event) => {
        const [mx] = d3.pointer(event);
        const week = Math.round(newX.invert(mx));
        if (week >= 1 && week <= 52) {
          _dispatch({ type: "SET_SELECTED_WEEK", value: week });
        }
      });

    // Zoom (attach to svg; update state.zoomTransform via dispatch)
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]])
      .on("zoom", (event) => {
        if (event.sourceEvent) {
          _dispatch({ type: "SET_ZOOM", value: event.transform });
        }
      });

    svg.call(zoom);

  } catch (err) {
    console.error("❌ Error in view-timeseries update:", err);
  }
}
