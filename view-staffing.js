// view-staffing.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Task 3 — Staffing Difference Explorer (Absolute + Delta)
 *
 * Adds:
 * - Better layout (more height/bottom margin)
 * - Horizontal y gridlines
 * - BrushY (value-range brush) that dims services outside the brushed metric range
 *
 * Brush is local UI state (does not dispatch) so it won't interfere with other views.
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

  controls.append("div")
    .style("font-size", "12px")
    .style("color", "#666")
    .attr("class", "staffing-subtitle");

  const btnWrap = controls.append("div")
    .style("display", "flex")
    .style("gap", "8px");

  const btnAbs = btnWrap.append("button")
    .attr("class", "btn active")
    .text("Absolute");

  const btnDel = btnWrap.append("button")
    .attr("class", "btn")
    .text("Delta");

  // Layout (fix chopped labels)
  const margin = { top: 10, right: 20, bottom: 75, left: 60 };
  const width = 1100 - margin.left - margin.right;
  const height = 360 - margin.top - margin.bottom;

  const svg = el.append("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const root = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().padding(0.22).range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  root.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  root.append("g").attr("class", "y-axis");
  root.append("g").attr("class", "y-grid");

  // Legend
  const legend = el.append("div")
    .style("display", "flex")
    .style("gap", "14px")
    .style("align-items", "center")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("margin", "6px 0 0 0");

  legend.html(`
    <span><span style="display:inline-block;width:10px;height:10px;background:#2ecc71;border:1px solid #2d3436;margin-right:6px;"></span>Staff present</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#d63031;border:1px solid #2d3436;margin-right:6px;"></span>Staff absent</span>
    <span style="margin-left:10px;color:#888;">Drag vertically to brush value range</span>
  `);

  const chart = root.append("g").attr("class", "chart");
  const overlay = root.append("g").attr("class", "overlay"); // brush layer on top

  const tooltip = d3.select("body").select(".chart-tooltip");

  // Store refs once (single source)
  container.refs = {
    dispatch,
    svg,
    root,
    chart,
    overlay,
    x,
    y,
    width,
    height,
    margin,
    tooltip,
    mode: "ABS",
    stateSnapshot: state,
    staffValueRange: null,
    brushG: null,
    brushY: null
  };

  // Buttons (use refs safely)
  btnAbs.on("click", () => {
    container.refs.mode = "ABS";
    btnAbs.classed("active", true);
    btnDel.classed("active", false);
    update(container, data, container.refs.stateSnapshot);
  });

  btnDel.on("click", () => {
    container.refs.mode = "DELTA";
    btnAbs.classed("active", false);
    btnDel.classed("active", true);
    update(container, data, container.refs.stateSnapshot);
  });

  // BrushY (create once; use current y-scale inside handler)
  const brushY = d3.brushY()
    .extent([[0, 0], [width, height]])
    .on("end", (event) => {
      const refs = container.refs;
      if (!event.selection) {
        refs.staffValueRange = null;
      } else {
        const [py0, py1] = event.selection;      // pixels top->bottom
        const v0 = refs.y.invert(py1);           // lower value
        const v1 = refs.y.invert(py0);           // higher value
        refs.staffValueRange = [Math.min(v0, v1), Math.max(v0, v1)];
      }
      update(container, data, refs.stateSnapshot);
    });

  const brushG = overlay.append("g").attr("class", "brush-y");
  brushG.call(brushY);

  container.refs.brushY = brushY;
  container.refs.brushG = brushG;
}

export function update(container, data, state) {
  const refs = container.refs;
  refs.stateSnapshot = state;

  const { chart, root, x, y, width, height, tooltip, dispatch } = refs;

  const metric = state.metric || "refusals";
  const metricLabel = {
    refusals: "Patient Refusals",
    morale: "Staff Morale",
    occupancy: "Occupancy",
    satisfaction: "Patient Satisfaction"
  }[metric] || metric;

  // Subtitle (include brush status)
  const subtitle = d3.select(container).select(".staffing-subtitle");
  const br = refs.staffValueRange;
  subtitle.text(
    `${metricLabel} • compare weeks by staffing presence` +
    (state.timeRange ? ` • weeks ${state.timeRange[0]}–${state.timeRange[1]}` : "") +
    (state.selectedEventType ? ` • event=${state.selectedEventType}` : "") +
    (br ? ` • brushed: ${br[0].toFixed(1)}–${br[1].toFixed(1)}` : "")
  );

  const rows = Array.isArray(data.serviceWeeklyStaff) ? data.serviceWeeklyStaff : [];
  chart.selectAll("*").remove();

  if (!rows.length) {
    root.select(".x-axis").call(d3.axisBottom(d3.scaleBand().range([0, width])));
    root.select(".y-axis").call(d3.axisLeft(d3.scaleLinear().range([height, 0])));
    root.select(".y-grid").selectAll("*").remove();
    return;
  }

  // Filter by global state
  const filtered = rows.filter(d => {
    const w = +d.week;
    if (state.timeRange && (w < state.timeRange[0] || w > state.timeRange[1])) return false;
    if (state.selectedEventType && d.eventType !== state.selectedEventType) return false;
    if (!Number.isFinite(+d[metric])) return false;
    return true;
  });

  const services = Array.from(new Set(filtered.map(d => d.service))).sort();
  if (!services.length) return;

  // Prepare per-service stats
  const stat = (arr) => {
    const a = arr.slice().sort(d3.ascending);
    return {
      n: a.length,
      mean: a.length ? d3.mean(a) : NaN,
      median: a.length ? d3.median(a) : NaN,
      q1: a.length ? d3.quantile(a, 0.25) : NaN,
      q3: a.length ? d3.quantile(a, 0.75) : NaN,
      min: a.length ? a[0] : NaN,
      max: a.length ? a[a.length - 1] : NaN
    };
  };

  const perService = services.map(svc => {
    const svcRows = filtered.filter(d => d.service === svc);
    const present = svcRows.filter(d => +d.staffPresent === 1).map(d => +d[metric]);
    const absent = svcRows.filter(d => +d.staffPresent === 0).map(d => +d[metric]);
    const p = stat(present);
    const a = stat(absent);
    return {
      service: svc,
      present: p,
      absent: a,
      deltaMean: (Number.isFinite(p.mean) && Number.isFinite(a.mean)) ? (p.mean - a.mean) : NaN,
      deltaMedian: (Number.isFinite(p.median) && Number.isFinite(a.median)) ? (p.median - a.median) : NaN
    };
  });

  x.domain(services);

  // helper: does service distribution overlap brush range?
  function overlapsRange(stats, range) {
    if (!range) return true;
    if (!stats || !Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return false;
    const [r0, r1] = range;
    return !(stats.max < r0 || stats.min > r1);
  }

  if (refs.mode === "ABS") {
    const allVals = filtered.map(d => +d[metric]).filter(Number.isFinite);
    const ext = d3.extent(allVals);
    y.domain([ext[0], ext[1]]).nice();

    // y grid
    root.select(".y-grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(""))
      .selectAll("line")
      .attr("stroke", "#ecf0f1")
      .attr("stroke-width", 1);
    root.select(".y-grid").select(".domain").remove();

    root.select(".x-axis")
      .call(d3.axisBottom(x).tickFormat(s => prettyService(s)))
      .selectAll("text")
      .style("font-size", "11px")
      .style("text-anchor", "end")
      .attr("transform", "rotate(-20)");

    root.select(".y-axis")
      .call(d3.axisLeft(y).ticks(5))
      .selectAll("text").style("font-size", "11px");

    const boxW = x.bandwidth();
    const cxA = boxW * 0.33;
    const cxP = boxW * 0.67;
    const bw = Math.min(16, boxW * 0.22);

    const inner = chart.selectAll("g.service")
      .data(perService, d => d.service)
      .join("g")
      .attr("class", "service")
      .attr("transform", d => `translate(${x(d.service)},0)`)
      .style("cursor", "pointer")
      .on("click", (e, d) => dispatch({ type: "SET_SELECTED_SERVICE", value: d.service }));

    function drawBox(g, stats, cx, color, label) {
      const has = stats && stats.n >= 2 && Number.isFinite(stats.q1) && Number.isFinite(stats.q3);
      const group = g.append("g").attr("transform", `translate(${cx},0)`);

      group.append("line")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", has ? y(stats.min) : y.range()[0])
        .attr("y2", has ? y(stats.max) : y.range()[0])
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("opacity", has ? 1 : 0.15);

      group.append("rect")
        .attr("x", -bw / 2)
        .attr("width", bw)
        .attr("y", has ? y(stats.q3) : y.range()[0])
        .attr("height", has ? Math.max(1, y(stats.q1) - y(stats.q3)) : 0)
        .attr("fill", color)
        .attr("opacity", 0.35)
        .attr("stroke", color)
        .attr("stroke-width", 2);

      group.append("line")
        .attr("x1", -bw / 2).attr("x2", bw / 2)
        .attr("y1", has ? y(stats.median) : y.range()[0])
        .attr("y2", has ? y(stats.median) : y.range()[0])
        .attr("stroke", color)
        .attr("stroke-width", 3)
        .attr("opacity", has ? 1 : 0.15);

      // hover target
      group.append("rect")
        .attr("x", -bw / 2 - 6)
        .attr("width", bw + 12)
        .attr("y", 0)
        .attr("height", height)
        .attr("fill", "transparent")
        .on("mouseover", (event) => {
          tooltip.style("opacity", 1)
            .html(`
              <strong>${prettyService(g.datum().service)}</strong> — ${label}<br>
              <span style="color:#666">N weeks:</span> ${stats.n || 0}<br>
              <span style="color:#666">Mean:</span> ${fmt(stats.mean, 2)}<br>
              <span style="color:#666">Median:</span> ${fmt(stats.median, 2)}<br>
              <span style="color:#666">Min–Max:</span> ${fmt(stats.min, 2)} – ${fmt(stats.max, 2)}
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

    inner.each(function(d) {
      const g = d3.select(this);
      drawBox(g, d.absent, cxA, "#d63031", "Staff absent");
      drawBox(g, d.present, cxP, "#2ecc71", "Staff present");
    });

    // Apply dimming from BOTH: selectedService and brush range
    const range = refs.staffValueRange;
    chart.selectAll("g.service").style("opacity", d => {
      const byService = state.selectedService && d.service !== state.selectedService;
      const byBrush = range ? !(overlapsRange(d.present, range) || overlapsRange(d.absent, range)) : false;
      if (byService && byBrush) return 0.12;
      if (byService) return 0.35;
      if (byBrush) return 0.15;
      return 1;
    });

  } else {
    // DELTA mode: dot plot per service (delta mean)
    const deltas = perService
      .map(d => ({ service: d.service, delta: d.deltaMean, nP: d.present.n, nA: d.absent.n }))
      .filter(d => Number.isFinite(d.delta));

    if (!deltas.length) return;

    x.domain(deltas.map(d => d.service));

    const ext = d3.extent(deltas, d => d.delta);
    const pad = (ext[1] - ext[0]) * 0.15 || 1;
    y.domain([ext[0] - pad, ext[1] + pad]).nice();

    // y grid
    root.select(".y-grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(""))
      .selectAll("line")
      .attr("stroke", "#ecf0f1")
      .attr("stroke-width", 1);
    root.select(".y-grid").select(".domain").remove();

    root.select(".x-axis")
      .call(d3.axisBottom(x).tickFormat(s => prettyService(s)))
      .selectAll("text")
      .style("font-size", "11px")
      .style("text-anchor", "end")
      .attr("transform", "rotate(-20)");

    root.select(".y-axis")
      .call(d3.axisLeft(y).ticks(5))
      .selectAll("text").style("font-size", "11px");

    chart.append("line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", y(0)).attr("y2", y(0))
      .attr("stroke", "#2d3436")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0.6);

    const g = chart.selectAll("g.delta")
      .data(deltas, d => d.service)
      .join("g")
      .attr("class", "delta")
      .attr("transform", d => `translate(${x(d.service) + x.bandwidth() / 2},0)`)
      .style("cursor", "pointer")
      .on("click", (e, d) => dispatch({ type: "SET_SELECTED_SERVICE", value: d.service }))
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1)
          .html(`
            <strong>${prettyService(d.service)}</strong><br>
            <span style="color:#666">Δ mean (${metricLabel}):</span> ${fmt(d.delta, 2)}<br>
            <span style="color:#666">N present / absent:</span> ${d.nP} / ${d.nA}
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

    g.append("line")
      .attr("x1", 0).attr("x2", 0)
      .attr("y1", y(0))
      .attr("y2", d => y(d.delta))
      .attr("stroke", "#b2bec3")
      .attr("stroke-width", 2);

    g.append("circle")
      .attr("cy", d => y(d.delta))
      .attr("r", 6)
      .attr("fill", d => d.delta >= 0 ? "#2ecc71" : "#d63031")
      .attr("stroke", "#2d3436")
      .attr("stroke-width", 1.2);

    // Apply dimming from BOTH: selectedService and brush range
    const range = refs.staffValueRange;
    chart.selectAll("g.delta").style("opacity", d => {
      const byService = state.selectedService && d.service !== state.selectedService;
      const byBrush = range ? !(d.delta >= range[0] && d.delta <= range[1]) : false;
      if (byService && byBrush) return 0.12;
      if (byService) return 0.35;
      if (byBrush) return 0.15;
      return 1;
    });
  }
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
