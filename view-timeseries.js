// view-timeseries.js (RESPONSIVE: fills panel, no fixed 1100x300)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getInnerSize, ensureSVG, makeRootG, observeResize } from "./viz-utils.js";

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  const margin = { top: 40, right: 60, bottom: 50, left: 60 };

  // Ensure tooltip exists
  let tooltip = d3.select("body").select(".chart-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
  }

  // Create/reuse svg
  const svg = ensureSVG(el);

  // Keep a stable clipPath id (unique per container)
  const clipId = `timeline-clip-${Math.random().toString(16).slice(2)}`;

  container._ts = { margin, dispatch, tooltip, clipId };

  // Re-render on resize
  container._ts_ro = observeResize(container, () => {
    update(container, data, state, dispatch);
  });

  // Initial render
  update(container, data, state, dispatch);
}

export function update(container, data, state, dispatch) {
  const el = d3.select(container);
  const { margin, tooltip, clipId } = container._ts || {};
  if (!margin) return;

  const dataset = (data && data.hospitalWeekly) ? data.hospitalWeekly : [];
  if (!dataset.length) return;

  const { width, height } = getInnerSize(container, margin, 300);

  const svg = el.select("svg");
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // defs + clip
  const defs = svg.append("defs");
  defs.append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const mainGroup = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // SCALES
  const x = d3.scaleLinear().domain([1, 52]).range([0, width]);
  const yLeft = d3.scaleLinear().range([height, 0]);
  const yRight = d3.scaleLinear().domain([40, 100]).range([height, 0]);

  // AXES groups
  const xAxisGroup = mainGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  const yAxisLeftGroup = mainGroup.append("g").attr("class", "y-axis-l");
  const yAxisRightGroup = mainGroup.append("g").attr("class", "y-axis-r").attr("transform", `translate(${width},0)`);

  // LABELS (top)
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 20)
    .attr("fill", "#e74c3c")
    .style("font-weight", "bold")
    .style("font-size", "12px")
    .text("← Patient Refusals");

  svg.append("text")
    .attr("x", width + margin.left)
    .attr("y", 20)
    .attr("fill", "#00b894")
    .style("font-weight", "bold")
    .style("text-anchor", "end")
    .style("font-size", "12px")
    .text("Staff Morale →");

  // Chart area
  const chartArea = mainGroup.append("g").attr("clip-path", `url(#${clipId})`);
  const pathRefusals = chartArea.append("path")
    .attr("fill", "#e74c3c")
    .attr("fill-opacity", 0.15)
    .attr("stroke", "#e74c3c")
    .attr("stroke-width", 2);

  const pathMorale = chartArea.append("path")
    .attr("fill", "none")
    .attr("stroke", "#00b894")
    .attr("stroke-width", 3);

  const dotsMorale = chartArea.append("g").attr("class", "semantic-dots");
  const eventGroup = chartArea.append("g").attr("class", "events");

  // selection line
  const selectionLine = chartArea.append("line")
    .attr("stroke", "#2d3436")
    .attr("stroke-width", 2.5)
    .attr("stroke-dasharray", "5 3")
    .style("opacity", 0)
    .style("pointer-events", "none");

  // Brush group
  const brushGroup = chartArea.append("g").attr("class", "brush");

  // BRUSH
  const brush = d3.brushX().extent([[0, 0], [width, height]])
    .on("end", (event) => {
      if (!event.sourceEvent) return;
      if (!event.selection) {
        dispatch({ type: "SET_TIME_RANGE", value: null });
      } else {
        const transform = state.zoomTransform || d3.zoomIdentity;
        const newX = transform.rescaleX(x);
        const [x0, x1] = event.selection;
        const w1 = Math.round(newX.invert(x0));
        const w2 = Math.round(newX.invert(x1));
        dispatch({ type: "SET_TIME_RANGE", value: [w1, w2] });
        brushGroup.call(brush.move, null);
      }
    });

  brushGroup.call(brush);

  // Click on overlay selects week
  brushGroup.select(".overlay")
    .on("click", (event) => {
      const [mx] = d3.pointer(event);
      const transform = state.zoomTransform || d3.zoomIdentity;
      const newX = transform.rescaleX(x);
      const week = Math.round(newX.invert(mx));
      if (week >= 1 && week <= 52) dispatch({ type: "SET_SELECTED_WEEK", value: week });
    });

  // ZOOM
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      if (event.sourceEvent) dispatch({ type: "SET_ZOOM", value: event.transform });
    });

  svg.call(zoom);

  // LEGEND (bottom)
  const legend = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top + height + 35})`);

  const drawLegendItem = (id, color, label, type, xPos) => {
    const g = legend.append("g")
      .attr("transform", `translate(${xPos}, 0)`)
      .style("cursor", "pointer")
      .on("click", () => dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: state.selectedEventType === id ? null : id }));

    if (type === "diamond") g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(100)).attr("fill", color).attr("stroke", "#333");
    else if (type === "square") g.append("rect").attr("width", 10).attr("height", 10).attr("x", -5).attr("y", -5).attr("fill", color).attr("stroke", "#333");
    else g.append("circle").attr("r", 6).attr("fill", color).attr("stroke", "#333");

    g.append("text").attr("x", 12).attr("y", 4).text(label).style("font-size", "12px").style("fill", "#444");
  };

  drawLegendItem("flu", "#9b59b6", "Flu (Filter)", "circle", 0);
  drawLegendItem("strike", "#e67e22", "Strike (Filter)", "diamond", 110);
  drawLegendItem("donation", "#3498db", "Donation (Filter)", "square", 245);

  // ---------- RENDER WITH CURRENT STATE ----------
  const transform = state.zoomTransform || d3.zoomIdentity;
  const newX = transform.rescaleX(x);

  // scales + axes
  yLeft.domain([0, d3.max(dataset, d => d.refusals) * 1.1]);
  xAxisGroup.call(d3.axisBottom(newX).ticks(10).tickFormat(d => `W${d}`));
  yAxisLeftGroup.call(d3.axisLeft(yLeft).ticks(5));
  yAxisRightGroup.call(d3.axisRight(yRight).ticks(5));

  // paths
  const area = d3.area()
    .x(d => newX(d.week))
    .y0(height)
    .y1(d => yLeft(d.refusals))
    .curve(d3.curveMonotoneX);

  const line = d3.line()
    .x(d => newX(d.week))
    .y(d => yRight(d.morale))
    .curve(d3.curveMonotoneX);

  pathRefusals.datum(dataset).attr("d", area);
  pathMorale.datum(dataset).attr("d", line);

  // selection line
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

  // event icons
  const events = dataset.filter(d => d.eventType !== "none");
  eventGroup.selectAll(".event-icon")
    .data(events)
    .join("g")
    .attr("class", "event-icon")
    .attr("transform", d => `translate(${newX(d.week)}, 25)`)
    .style("opacity", d => (state.selectedEventType && d.eventType !== state.selectedEventType) ? 0.1 : 1)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      e.stopPropagation();
      dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: state.selectedEventType === d.eventType ? null : d.eventType });
    })
    .on("mouseover", (e, d) => {
      tooltip.style("opacity", 1).html(`<strong>${d.eventType.toUpperCase()}</strong>`)
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
        g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(150))
          .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      } else if (d.eventType === "donation") {
        g.append("rect").attr("width", 12).attr("height", 12).attr("x", -6).attr("y", -6)
          .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      } else {
        g.append("circle").attr("r", 7)
          .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      }
    });

  // semantic zoom dots
  if (transform.k > 2) {
    dotsMorale.selectAll("circle")
      .data(dataset)
      .join("circle")
      .attr("cx", d => newX(d.week))
      .attr("cy", d => yRight(d.morale))
      .attr("r", 4)
      .attr("fill", "white")
      .attr("stroke", "#00b894")
      .attr("stroke-width", 2);
  } else {
    dotsMorale.selectAll("circle").remove();
  }
}
