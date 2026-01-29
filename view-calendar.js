import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function init(container, data, state, dispatch) {
  const el = d3.select(container);
  el.selectAll("*").remove();

  const margin = { top: 30, right: 40, bottom: 50, left: 40 };
  const width = 1100 - margin.left - margin.right;
  const height = 140 - margin.top - margin.bottom;

  const svg = el.append("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(d3.range(1, 53)).range([0, width]).padding(0.15);

  // Axis
  const monthStarts = [1, 5, 9, 13, 17, 22, 26, 31, 35, 40, 44, 48];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  svg.selectAll(".month-label").data(monthNames).join("text")
    .attr("class", "month-label")
    .attr("x", (d, i) => x(monthStarts[i]))
    .attr("y", -10)
    .text(d => d)
    .style("font-size", "11px")
    .style("fill", "#666")
    .style("font-weight", "bold");

  const xAxis = d3.axisBottom(x)
    .tickValues([1,5,10,15,20,25,30,35,40,45,50,52])
    .tickFormat(d => `W${d}`);

  svg.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(xAxis)
    .select(".domain").remove();

  container.svg = svg;
  container.x = x;
  container.tooltip = d3.select("body").select(".chart-tooltip");
}

export function update(container, data, state, dispatch) {
  const { svg, x, tooltip } = container;

  const dataset = data.hospitalWeekly || [];
  if (!dataset.length) return;

  const heatScales = {
    refusals: d3.scaleSequential(d3.interpolateReds).domain([0, 470]),
    morale: d3.scaleSequential(d3.interpolateRdYlGn).domain([60, 90]),
    occupancy: d3.scaleSequential(d3.interpolateBlues).domain([0.5, 1]),
    satisfaction: d3.scaleSequential(d3.interpolatePuBuGn).domain([60, 95])
  };

  const metric = state.metric || "refusals";
  const scale = heatScales[metric] || heatScales.refusals;

  let isEventMode = state.selectedEventType !== null && state.selectedEventType !== undefined;
  let eventColor = "#ccc";
  if (state.selectedEventType === "flu") eventColor = "#9b59b6";
  if (state.selectedEventType === "strike") eventColor = "#e67e22";
  if (state.selectedEventType === "donation") eventColor = "#3498db";

  svg.selectAll(".cell")
    .data(dataset, d => d.week)
    .join("rect")
    .attr("class", "cell")
    .attr("x", d => x(d.week))
    .attr("y", 0)
    .attr("width", x.bandwidth())
    .attr("height", 40)
    .attr("rx", 3)
    .style("cursor", "pointer")
    .on("click", (e, d) => dispatch({ type: "SET_SELECTED_WEEK", value: d.week }))
    .on("mouseover", (event, d) => {
      d3.select(event.currentTarget).attr("stroke", "#333").attr("stroke-width", 2);

      const v = Number.isFinite(+d[metric]) ? +d[metric] : NaN;
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Week ${d.week}</strong><br>
          ${d.eventType && d.eventType !== "none" ? `<span style="color:red">${String(d.eventType).toUpperCase()}</span><br>` : ""}
          ${metric}: ${Number.isFinite(v) ? v.toFixed(2) : "—"}
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", function() {
      d3.select(this).attr("stroke", d => d.week === state.selectedWeek ? "black" : "none");
      tooltip.style("opacity", 0);
    })
    .transition().duration(400)
    .attr("fill", d => {
      if (isEventMode) {
        return d.eventType === state.selectedEventType ? eventColor : "#f1f2f6";
      }
      return scale(+d[metric]);
    })
    .attr("opacity", d => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return 0.2;
      return 1;
    })
    .attr("stroke", d => d.week === state.selectedWeek ? "black" : "none")
    .attr("stroke-width", d => d.week === state.selectedWeek ? 3 : 0);
}
