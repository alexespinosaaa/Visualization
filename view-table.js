// view-table.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Interactive Linked Data Table (Lookup + Navigation)
 *
 * This version removes the "Showing Weeks..." status text (chartjunk),
 * while keeping a minimal empty-state message when no rows match filters.
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);

  const headerNode = el.select(".panel-header").node();
  el.selectAll("*").remove();
  if (headerNode) el.node().appendChild(headerNode);

  const content = el.append("div")
    .attr("class", "table-wrap")
    .style("overflow", "auto")
    .style("max-height", "320px");

  // NOTE AREA (we keep it for empty-state only)
  const note = el.append("div")
    .attr("class", "table-note")
    .style("margin-top", "10px")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("display", "none"); // hidden by default

  const table = content.append("table")
    .style("width", "100%")
    .style("border-collapse", "separate")
    .style("border-spacing", "0")
    .style("font-size", "12px");

  const thead = table.append("thead");
  const tbody = table.append("tbody");

  const tooltip = d3.select("body").select(".chart-tooltip");

  container.refs = {
    el,
    content,
    table,
    thead,
    tbody,
    tooltip,
    dispatch,

    // Keep whatever sort behavior you currently have
    weekOrder: "asc",
    withinWeekSort: { key: null, dir: "desc", type: "num" },

    lastMode: null,
    note
  };

  const style = document.createElement("style");
  style.textContent = `
    #view-table table thead th {
      position: sticky;
      top: 0;
      background: #ffffff;
      z-index: 2;
      text-align: left;
      padding: 10px 10px;
      border-bottom: 1px solid #eee;
      font-weight: 700;
      color: #2d3436;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    #view-table table thead th:hover { background: #f8f9fb; }
    #view-table table tbody td {
      padding: 10px 10px;
      border-bottom: 1px solid #f1f2f6;
      color: #2d3436;
      white-space: nowrap;
    }
    #view-table table tbody tr:hover td { background: #f8f9fb; }
    #view-table table tbody tr.selected td {
      background: rgba(9, 132, 227, 0.10);
      border-bottom-color: rgba(9, 132, 227, 0.25);
    }
    #view-table .sort-indicator {
      font-size: 11px;
      color: #636e72;
      margin-left: 6px;
    }
  `;
  document.head.appendChild(style);
}

export function update(container, data, state) {
  const { thead, tbody, tooltip, dispatch, note } = container.refs;

  const rawRows = Array.isArray(data.serviceWeekly) ? data.serviceWeekly : [];
  if (!rawRows.length) {
    thead.selectAll("*").remove();
    tbody.selectAll("*").remove();
    // Minimal empty-state
    note.style("display", "block").text("No service-week data loaded.");
    return;
  }

  const rows = rawRows.map(r => normalizeRow(r));

  const mode = getTableMode(state);
  const currentWeek = resolveWeek(state);

  // Range defaults
  if (container.refs.lastMode !== mode) {
    container.refs.lastMode = mode;
    if (mode === "RANGE") {
      container.refs.weekOrder = "asc";
      container.refs.withinWeekSort = { key: null, dir: "desc", type: "num" };
    }
  }

  // Base filter
  let filtered = rows.filter(d => {
    const w = +d.week;
    if (mode === "RANGE") {
      const [w1, w2] = state.timeRange;
      return w >= +w1 && w <= +w2;
    }
    return w === +currentWeek;
  });

  if (state.selectedEventType) filtered = filtered.filter(d => d.eventType === state.selectedEventType);
  if (state.selectedService) filtered = filtered.filter(d => d.service === state.selectedService);

  const hasData = filtered.length > 0;

  const columns = [
    { key: "week", label: "Week", type: "num", format: v => `W${v}` },
    { key: "service", label: "Service", type: "str", format: v => prettyService(v) },
    { key: "eventType", label: "Event", type: "str", format: v => (v || "none").toUpperCase() },
    { key: "morale", label: "Morale", type: "num", format: v => fmtNumber(v, 1) },
    { key: "satisfaction", label: "Satisfaction", type: "num", format: v => fmtNumber(v, 1) },
    { key: "refusals", label: "Refusals", type: "num", format: v => fmtNumber(v, 0) },
    { key: "occupancy", label: "Occupancy", type: "num", format: v => fmtPct(v, 1) }
  ];

  // ---- Sorting (keep existing behavior) ----
  const weekOrder = container.refs.weekOrder;
  const ws = container.refs.withinWeekSort;

  const decorated = filtered.map((d, i) => ({
    d,
    i,
    _week: +d.week,
    _morale: numOrNaN(d.morale),
    _satisfaction: numOrNaN(d.satisfaction),
    _refusals: numOrNaN(d.refusals),
    _occupancy: numOrNaN(d.occupancy),
    _service: String(d.service ?? ""),
    _eventType: String(d.eventType ?? "")
  }));

  decorated.sort((A, B) => {
    const wCmpAsc = d3.ascending(A._week, B._week);
    if (wCmpAsc !== 0) return weekOrder === "asc" ? wCmpAsc : -wCmpAsc;

    const key = ws.key;
    if (key) {
      let cmp = 0;
      if (ws.type === "num") {
        const aVal = pickNumByKey(A, key);
        const bVal = pickNumByKey(B, key);

        const aOk = Number.isFinite(aVal);
        const bOk = Number.isFinite(bVal);

        if (!aOk && !bOk) cmp = 0;
        else if (!aOk) cmp = 1;
        else if (!bOk) cmp = -1;
        else cmp = d3.ascending(aVal, bVal);
      } else {
        cmp = d3.ascending(pickStrByKey(A, key), pickStrByKey(B, key));
      }
      if (cmp !== 0) return ws.dir === "asc" ? cmp : -cmp;
    }

    const sCmp = d3.ascending(A._service, B._service);
    if (sCmp !== 0) return sCmp;

    return d3.ascending(A.i, B.i);
  });

  const sortedData = decorated.map(x => x.d);

  // ---- Header render ----
  const headerRow = thead.selectAll("tr").data([null]).join("tr");
  const ths = headerRow.selectAll("th")
    .data(columns, d => d.key)
    .join("th");

  ths.each(function(c) {
    const th = d3.select(this);
    th.selectAll("*").remove();
    th.append("span").text(c.label);

    // Keep indicators if you want; remove these too if you want ultra-minimal
    if (c.key === "week") {
      th.append("span")
        .attr("class", "sort-indicator")
        .text(container.refs.weekOrder === "asc" ? "▲" : "▼");
    } else if (container.refs.withinWeekSort.key === c.key) {
      th.append("span")
        .attr("class", "sort-indicator")
        .text(container.refs.withinWeekSort.dir === "asc" ? "▲" : "▼");
    }
  });

  ths.on("click", (event, c) => {
    event.preventDefault();
    event.stopPropagation();

    if (c.key === "week") {
      container.refs.weekOrder = (container.refs.weekOrder === "asc") ? "desc" : "asc";
      update(container, data, state);
      return;
    }

    const prev = container.refs.withinWeekSort;
    if (prev.key === c.key) {
      prev.dir = (prev.dir === "asc") ? "desc" : "asc";
    } else {
      const defaultDir = (c.type === "num") ? "desc" : "asc";
      container.refs.withinWeekSort = { key: c.key, dir: defaultDir, type: c.type };
    }
    update(container, data, state);
  });

  // ---- Body render ----
  const trs = tbody.selectAll("tr")
    .data(hasData ? sortedData : [], d => `${d.week}|${d.service}`);

  trs.exit().remove();

  const trsEnter = trs.enter().append("tr")
    .style("cursor", "pointer");

  const trsAll = trsEnter.merge(trs);

  trsAll.classed("selected", d => {
    const isWeek = state.selectedWeek ? (+d.week === +state.selectedWeek) : false;
    const isService = state.selectedService ? (d.service === state.selectedService) : false;
    return isWeek && isService;
  });

  trsAll.selectAll("td")
    .data(row => columns.map(c => ({ col: c, value: row[c.key], row })), d => d.col.key)
    .join("td")
    .text(d => d.col.format(d.value));

  trsAll
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(`
        <strong>${prettyService(d.service)}</strong> — Week ${d.week}<br>
        <span style="color:#666">Event:</span> ${(d.eventType || "none").toUpperCase()}<br>
        <span style="color:#666">Refusals:</span> ${fmtNumber(d.refusals, 0)}<br>
        <span style="color:#666">Morale:</span> ${fmtNumber(d.morale, 1)}<br>
        <span style="color:#666">Satisfaction:</span> ${fmtNumber(d.satisfaction, 1)}<br>
        <span style="color:#666">Occupancy:</span> ${fmtPct(d.occupancy, 1)}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", (event, d) => {
      dispatch({ type: "SET_SELECTED_SERVICE", value: d.service });
      dispatch({ type: "SET_SELECTED_WEEK", value: +d.week });
    });

  // ---- NOTE (remove chartjunk) ----
  // Only show something if empty.
  if (!hasData) {
    note.style("display", "block").text("No rows match the current filters.");
  } else {
    note.style("display", "none").text("");
  }
}

// ---- Mode helpers ----
function getTableMode(state) {
  if (state.selectedWeek !== null && state.selectedWeek !== undefined) return "WEEK";
  if (state.timeRange && Array.isArray(state.timeRange) && state.timeRange.length === 2) return "RANGE";
  return "WEEK";
}

function resolveWeek(state) {
  if (state.selectedWeek !== null && state.selectedWeek !== undefined) return +state.selectedWeek;
  if (state.timeRange && Array.isArray(state.timeRange) && state.timeRange.length === 2) {
    const [w1, w2] = state.timeRange;
    return Math.round((+w1 + +w2) / 2);
  }
  return 1;
}

// ---- Normalization ----
function normalizeRow(r) {
  const week = +r.week;
  const service = r.service;
  const eventType = (r.eventType ?? r.event ?? "none");

  const refusals = pickNumber(r.refusals, r.patients_refused);
  const morale = pickNumber(r.morale, r.staff_morale);
  const satisfaction = pickNumber(r.satisfaction, r.patient_satisfaction);

  let occupancy = pickNumber(r.occupancy, NaN);
  if (!Number.isFinite(occupancy)) {
    const admitted = pickNumber(r.patients_admitted, NaN);
    const beds = pickNumber(r.available_beds, NaN);
    occupancy = (Number.isFinite(admitted) && Number.isFinite(beds) && beds !== 0) ? admitted / beds : NaN;
  }

  return { week, service, eventType, refusals, morale, satisfaction, occupancy };
}

function pickNumber(a, b) {
  const x = +a;
  if (Number.isFinite(x)) return x;
  const y = +b;
  if (Number.isFinite(y)) return y;
  return NaN;
}

// ---- Sorting helpers (kept for current behavior) ----
function numOrNaN(v) {
  const x = +v;
  return Number.isFinite(x) ? x : NaN;
}
function pickNumByKey(A, key) {
  if (key === "morale") return A._morale;
  if (key === "satisfaction") return A._satisfaction;
  if (key === "refusals") return A._refusals;
  if (key === "occupancy") return A._occupancy;
  if (key === "week") return A._week;
  return NaN;
}
function pickStrByKey(A, key) {
  if (key === "service") return A._service;
  if (key === "eventType") return A._eventType;
  return "";
}

// ---- Format helpers ----
function fmtNumber(v, digits = 1) {
  const x = +v;
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}
function fmtPct(v, digits = 1) {
  const x = +v;
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toFixed(digits) + "%";
}
function prettyService(s) {
  if (!s) return "—";
  return String(s)
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}
