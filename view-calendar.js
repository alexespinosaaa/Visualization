// view-calendar.js (RESPONSIVE: fills width, keeps appropriate height)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getInnerSize, ensureSVG, observeResize } from "./viz-utils.js";

export function init(container, data, state, dispatch) {
  const el = d3.select(container);

  // Only remove old SVGs inside, keep header/summary row
  el.selectAll("svg").remove();

  const margin = { top: 30, right: 40, bottom: 50, left: 40 };
  const svg = ensureSVG(el);

  // Tooltip
  let tooltip = d3.select("body").select(".chart-tooltip");
  if (tooltip.empty()) tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");

  container._cal = { margin, dispatch, tooltip };

  // ✅ SINGLE-CLICK KPI FIX: bind button listeners once (no inline onclick / no global event)
  bindMetricButtons(container);

  container._cal_ro = observeResize(container, () => {
    update(container, data, state, dispatch);
  });

  update(container, data, state, dispatch);
}

function bindMetricButtons(container) {
  if (container._calMetricBound) return; // bind once

  const controls = document.getElementById("metric-controls");
  if (!controls) return;

  controls.querySelectorAll("button.btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const label = (btn.textContent || "").trim().toLowerCase();

      // Map button labels to metric keys (robust)
      const map = {
        refusals: "refusals",
        morale: "morale",
        occupancy: "occupancy",
        satisfaction: "satisfaction",
      };

      // If your button labels are different, you can also support data-metric attributes:
      const metric = btn.dataset.metric || map[label] || null;
      if (!metric) return;

      // Update active styling
      controls.querySelectorAll("button.btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Dispatch metric change immediately (single click)
      const _dispatch = container._cal?.dispatch || window.dispatch;
      if (typeof _dispatch === "function") {
        _dispatch({ type: "SET_METRIC", value: metric });
      }
    });
  });

  container._calMetricBound = true;
}

export function update(container, data, state, dispatch) {
  const el = d3.select(container);
  const cfg = container._cal;
  if (!cfg) return;

  // Keep latest dispatch reference
  if (dispatch) cfg.dispatch = dispatch;

  const { margin, tooltip } = cfg;

  const dataset = data.hospitalWeekly || [];
  if (!dataset.length) return;

  // Calendar needs less height; but still responsive to panel size
  const { width } = getInnerSize(container, margin, 180);
  const cellBandH = 40;                   // heat row height
  const innerH = Math.max(60, cellBandH); // keep it clean and compact
  const outerH = innerH + margin.top + margin.bottom;

  const svg = el.select("svg");
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${outerH}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(d3.range(1, 53))
    .range([0, width])
    .padding(0.15);

  // Axis: month labels + week ticks
  const monthStarts = [1, 5, 9, 13, 17, 22, 26, 31, 35, 40, 44, 48];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  g.selectAll(".month-label")
    .data(monthNames)
    .join("text")
    .attr("class", "month-label")
    .attr("x", (d, i) => x(monthStarts[i]) ?? 0)
    .attr("y", -10)
    .text(d => d)
    .style("font-size", "11px")
    .style("fill", "#666")
    .style("font-weight", "bold");

  const xAxis = d3.axisBottom(x)
    .tickValues([1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 52])
    .tickFormat(d => `W${d}`);

  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(xAxis)
    .select(".domain")
    .remove();

  // Heat scales
  const heatScales = {
    refusals: d3.scaleSequential(d3.interpolateReds).domain([0, 470]),
    morale: d3.scaleSequential(d3.interpolateRdYlGn).domain([60, 90]),
    occupancy: d3.scaleSequential(d3.interpolateBlues).domain([0.5, 1]),
    satisfaction: d3.scaleSequential(d3.interpolatePuBuGn).domain([60, 99])
  };

  // Event mode
  const isEventMode = state.selectedEventType !== null && state.selectedEventType !== undefined;
  let eventColor = "#ccc";
  if (state.selectedEventType === "flu") eventColor = "#9b59b6";
  if (state.selectedEventType === "strike") eventColor = "#e67e22";
  if (state.selectedEventType === "donation") eventColor = "#3498db";

  g.selectAll(".cell")
    .data(dataset, d => d.week)
    .join("rect")
    .attr("class", "cell")
    .attr("x", d => x(d.week))
    .attr("y", 0)
    .attr("width", x.bandwidth())
    .attr("height", cellBandH)
    .attr("rx", 3)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      const _dispatch = cfg.dispatch || window.dispatch;
      if (typeof _dispatch === "function") {
        _dispatch({ type: "SET_SELECTED_WEEK", value: d.week });
      }
    })
    .on("mouseover", (event, d) => {
      d3.select(event.currentTarget).attr("stroke", "#333").attr("stroke-width", 2);
      const m = state.metric || "refusals";
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Week ${d.week}</strong><br>
          ${d.eventType !== "none" ? `<span style="color:#d63031">${String(d.eventType).toUpperCase()}</span><br>` : ""}
          ${m}: ${Number.isFinite(+d[m]) ? (+d[m]).toFixed(1) : d[m]}
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", function() {
      d3.select(this).attr("stroke", d => d.week === state.selectedWeek ? "black" : "none");
      tooltip.style("opacity", 0);
    })
    .attr("fill", d => {
      if (isEventMode) return d.eventType === state.selectedEventType ? eventColor : "#f1f2f6";
      const m = state.metric || "refusals";
      const scale = heatScales[m] || heatScales.refusals;
      return scale(+d[m]);
    })
    .attr("opacity", d => {
      if (state.timeRange && (d.week < state.timeRange[0] || d.week > state.timeRange[1])) return 0.2;
      return 1;
    })
    .attr("stroke", d => d.week === state.selectedWeek ? "black" : "none")
    .attr("stroke-width", d => d.week === state.selectedWeek ? 3 : 0);
}
