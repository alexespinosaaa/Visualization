import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  container._tsState = {
    dispatch,
    clipId: `timeline-clip-${Math.random().toString(16).slice(2)}`,
    _ro: null
  };

  const wrapper = el.append("div")
    .attr("class", "timeseries-wrapper")
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "flex")
    .style("flex-direction", "column");

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

  const svg = wrapper.append("svg")
    .attr("class", "timeseries-chart")
    .style("width", "100%")
    .style("height", "100%")
    .style("flex", "1")
    .style("min-height", "0")
    .style("display", "block")
    .attr("preserveAspectRatio", "xMidYMid meet");

  _buildScaffold(container, svg);

  requestAnimationFrame(() => update(container, data, state, dispatch));

  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => update(container, data, state, dispatch));
  });
  ro.observe(container);
  container._tsState._ro = ro;
}

function _buildScaffold(container, svgSel) {
  const clipId = container._tsState.clipId;

  svgSel.selectAll("*").remove();

  svgSel.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("class", "clip-rect");

  const root = svgSel.append("g").attr("class", "root");

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

  // IMPORTANT: a dedicated capture layer (so zoom does NOT bind to whole svg)
  chartArea.append("rect")
    .attr("class", "zoom-capture")
    .attr("fill", "transparent")
    .style("pointer-events", "all");

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

  chartArea.append("g").attr("class", "x-axis");
  chartArea.append("g").attr("class", "y-axis-l");
  chartArea.append("g").attr("class", "y-axis-r");

  clipped.append("g").attr("class", "brush");
}

export function update(container, data, state, dispatch) {
  try {
    const ds = (data && data.hospitalWeekly) ? data.hospitalWeekly : [];
    if (!ds.length) return;

    if (dispatch) container._tsState.dispatch = dispatch;
    const _dispatch = container._tsState.dispatch || window.dispatch;

    const svg = d3.select(container).select("svg.timeseries-chart");
    if (svg.empty()) return;

    const wrapperNode = d3.select(container).select(".timeseries-wrapper").node();
    const controlsNode = d3.select(container).select(".timeseries-controls").node();
    if (!wrapperNode || !controlsNode) return;

    const wrapperRect = wrapperNode.getBoundingClientRect();
    const controlsRect = controlsNode.getBoundingClientRect();

    const W = Math.max(320, Math.floor(wrapperRect.width));
    const H = Math.max(280, Math.floor(wrapperRect.height - controlsRect.height));

    svg.attr("width", W).attr("height", H);
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const margin = { top: 34, right: 64, bottom: 54, left: 64 };
    const width = Math.max(10, W - margin.left - margin.right);
    const height = Math.max(10, H - margin.top - margin.bottom);

    svg.select(".label-left").attr("x", margin.left).attr("y", 18);
    svg.select(".label-right").attr("x", W - margin.right).attr("y", 18);

    const root = svg.select("g.root")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const clipId = container._tsState.clipId;
    svg.select(`#${clipId} .clip-rect`)
      .attr("width", width)
      .attr("height", height);

    const chartArea = root.select("g.chartArea");

    // Resize zoom capture rect to plot area
    chartArea.select("rect.zoom-capture")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", height);

    chartArea.select("g.clipped")
      .attr("clip-path", `url(#${clipId})`);

    const x = d3.scaleLinear().domain([1, 52]).range([0, width]);
    const yLeft = d3.scaleLinear().range([height, 0]);
    const yRight = d3.scaleLinear().domain([40, 100]).range([height, 0]);

    const transform = state.zoomTransform || d3.zoomIdentity;
    const newX = transform.rescaleX(x);

    yLeft.domain([0, d3.max(ds, d => +d.refusals) * 1.1]).nice();

    chartArea.select(".x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(newX).ticks(12).tickFormat(d => `W${d}`));

    chartArea.select(".y-axis-l")
      .call(d3.axisLeft(yLeft).ticks(6));

    chartArea.select(".y-axis-r")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yRight).ticks(6));

    const area = d3.area()
      .x(d => newX(+d.week))
      .y0(height)
      .y1(d => yLeft(+d.refusals))
      .curve(d3.curveMonotoneX);

    const line = d3.line()
      .x(d => newX(+d.week))
      .y(d => yRight(+d.morale))
      .curve(d3.curveMonotoneX);

    const clipped = chartArea.select("g.clipped");

    clipped.select("path.area-refusals").datum(ds).attr("d", area);
    clipped.select("path.line-morale").datum(ds).attr("d", line);

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

    // ===== Events (unchanged) =====
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

    // Semantic dots
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

    // ===== Brush (FIX: always clear selection after range chosen) =====
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

        // KEY FIX: clear brush rectangle so it never "sticks"
        brushGroup.call(brush.move, null);
      });

    brushGroup.call(brush);

    brushGroup.select(".overlay")
      .style("cursor", "pointer")
      .on("click", (event) => {
        const [mx] = d3.pointer(event);
        const week = Math.round(newX.invert(mx));
        if (week >= 1 && week <= 52) {
          _dispatch({ type: "SET_SELECTED_WEEK", value: week });
        }
      });

    // ===== Zoom (FIX: wheel-only, plot-area only) =====
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]])
      .filter((event) => {
        // only zoom on wheel, no drag-pan, no dblclick zoom
        return event.type === "wheel";
      })
      .on("zoom", (event) => {
        if (event.sourceEvent) {
          _dispatch({ type: "SET_ZOOM", value: event.transform });
        }
      });

    // Attach zoom ONLY to the plot-area capture rect
    chartArea.select("rect.zoom-capture").call(zoom);

  } catch (err) {
    console.error("Error in view-timeseries update:", err);
  }
}
