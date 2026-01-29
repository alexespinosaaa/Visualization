import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";


export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();


  const margin = { top: 40, right: 60, bottom: 40, left: 60 };
  const width = 1100 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;


  const svg = el.append("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style("overflow", "visible");


  svg.append("defs").append("clipPath").attr("id", "timeline-clip")
    .append("rect").attr("width", width).attr("height", height);


  const mainGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);


  const x = d3.scaleLinear().domain([1, 52]).range([0, width]);
  const yLeft = d3.scaleLinear().range([height, 0]);
  const yRight = d3.scaleLinear().domain([40, 100]).range([height, 0]);


  const xAxisGroup = mainGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  const yAxisLeftGroup = mainGroup.append("g").attr("class", "y-axis-l");
  const yAxisRightGroup = mainGroup.append("g").attr("class", "y-axis-r").attr("transform", `translate(${width},0)`);


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
    .text("Staff Morale →");


  const chartArea = mainGroup.append("g").attr("clip-path", "url(#timeline-clip)");
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


  const selectionLine = chartArea.append("line")
    .attr("stroke", "#2d3436")
    .attr("stroke-width", 2.5)
    .attr("stroke-dasharray", "5 3")
    .style("opacity", 0)
    .style("pointer-events", "none");


  const brushGroup = chartArea.append("g").attr("class", "brush");


  const eventGroup = chartArea.append("g").attr("class", "events");


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


  brushGroup.select(".overlay")
    .on("click", (event) => {
      const [mx] = d3.pointer(event);
      const transform = d3.zoomTransform(svg.node());
      const newX = transform.rescaleX(x);
      const week = Math.round(newX.invert(mx));
      if (week >= 1 && week <= 52) dispatch({ type: "SET_SELECTED_WEEK", value: week });
    });


  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      if (event.sourceEvent) dispatch({ type: "SET_ZOOM", value: event.transform });
    });


  svg.call(zoom);


  const legend = svg.append("g").attr("transform", `translate(10, ${height + 35})`);


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
  drawLegendItem("strike", "#e67e22", "Strike (Filter)", "diamond", 100);
  drawLegendItem("donation", "#3498db", "Donation (Filter)", "square", 220);


  container.refs = {
    svg, x, yLeft, yRight,
    xAxisGroup, yAxisLeftGroup, yAxisRightGroup,
    pathRefusals, pathMorale,
    eventGroup, dotsMorale,
    selectionLine,
    tooltip: d3.select("body").select(".chart-tooltip"),
    zoom, brushGroup, brush
  };
}


export function update(container, data, state, dispatch) {
  const {
    svg, x, yLeft, yRight,
    xAxisGroup, yAxisLeftGroup, yAxisRightGroup,
    pathRefusals, pathMorale,
    eventGroup, dotsMorale,
    tooltip,
    selectionLine,
    brushGroup, brush
  } = container.refs;


  const dataset = data.hospitalWeekly || [];
  if (!dataset.length) return;


  const transform = state.zoomTransform || d3.zoomIdentity;
  const newX = transform.rescaleX(x);


  yLeft.domain([0, d3.max(dataset, d => +d.refusals) * 1.1]);


  xAxisGroup.call(d3.axisBottom(newX).ticks(10).tickFormat(d => `W${d}`));
  yAxisLeftGroup.transition().call(d3.axisLeft(yLeft).ticks(5));
  yAxisRightGroup.transition().call(d3.axisRight(yRight).ticks(5));


  const area = d3.area()
    .x(d => newX(d.week))
    .y0(yLeft.range()[0])
    .y1(d => yLeft(d.refusals))
    .curve(d3.curveMonotoneX);


  const line = d3.line()
    .x(d => newX(d.week))
    .y(d => yRight(d.morale))
    .curve(d3.curveMonotoneX);


  pathRefusals.datum(dataset).attr("d", area);
  pathMorale.datum(dataset).attr("d", line);


  if (state.selectedWeek) {
    const chartHeight = yLeft.range()[0];
    selectionLine
      .attr("x1", newX(state.selectedWeek))
      .attr("x2", newX(state.selectedWeek))
      .attr("y1", 0)
      .attr("y2", chartHeight)
      .style("opacity", 1);
  } else {
    selectionLine.style("opacity", 0);
  }


  // 🔧 FIX: Update brush UI when timeRange changes externally
  if (state.timeRange && state.timeRange.length === 2) {
    const [w1, w2] = state.timeRange;
    const x0 = newX(w1);
    const x1 = newX(w2);
    brushGroup.call(brush.move, [x0, x1]);
  } else {
    brushGroup.call(brush.move, null);
  }


  const events = dataset.filter(d => d.eventType && d.eventType !== "none");


  eventGroup.selectAll(".event-icon")
    .data(events, d => d.week)
    .join("g")
    .attr("class", "event-icon")
    .attr("transform", d => `translate(${newX(d.week)}, 25)`)
    .style("opacity", d => (state.selectedEventType && d.eventType !== state.selectedEventType) ? 0.1 : 1)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      e.stopPropagation();
      const newVal = state.selectedEventType === d.eventType ? null : d.eventType;
      dispatch({ type: "SET_SELECTED_EVENT_TYPE", value: newVal });
    })
    .on("mouseover", (e, d) => {
      tooltip
        .style("opacity", 1)
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
        g.append("path").attr("d", d3.symbol().type(d3.symbolDiamond).size(150)).attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      } else if (d.eventType === "donation") {
        g.append("rect").attr("width", 12).attr("height", 12).attr("x", -6).attr("y", -6).attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      } else {
        g.append("circle").attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 1);
      }
    });


  if (transform.k > 2) {
    dotsMorale.selectAll("circle").data(dataset, d => d.week).join("circle")
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
