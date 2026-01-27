// view-table.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Interactive Linked Data Table (Lookup + Navigation)
 *
 * Changes vs previous:
 *  1) Sorting toggle works across all columns (robust numeric/string compare + stable sort).
 *  2) If state.timeRange is set and state.selectedWeek is null -> show ALL rows within the brushed interval (scrollable).
 *  3) This resolves the "events appear in other views but not in table" issue (table was only showing midpoint week).
 */

export function init(container, data, state, dispatch) {
  const el = d3.select(container);

  // Preserve panel header
  const headerNode = el.select(".panel-header").node();
  el.selectAll("*").remove();
  if (headerNode) el.node().appendChild(headerNode);

  // Scroll container
  const content = el.append("div")
    .attr("class", "table-wrap")
    .style("overflow", "auto")
    .style("max-height", "320px"); // ensures brush range is scrollable

  const note = el.append("div")
    .attr("class", "table-note")
    .style("margin-top", "10px")
    .style("font-size", "12px")
    .style("color", "#666");

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
    sort: { key: "week", dir: "asc" } // default: chronological
  };

  // Styles (id-scoped)
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
    #view-table table thead th:hover {
      background: #f8f9fb;
    }
    #view-table table tbody td {
      padding: 10px 10px;
      border-bottom: 1px solid #f1f2f6;
      color: #2d3436;
      white-space: nowrap;
    }
    #view-table table tbody tr:hover td {
      background: #f8f9fb;
    }
    #view-table table tbody tr.selected td {
      background: rgba(9, 132, 227, 0.10);
      border-bottom-color: rgba(9, 132, 227, 0.25);
    }
    #view-table table tbody tr.dim td {
      opacity: 0.35;
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
  const { thead, tbody, tooltip, dispatch, sort } = container.refs;

  const rows = Array.isArray(data.serviceWeekly) ? data.serviceWeekly : [];
  if (!rows.length) {
    thead.selectAll("*").remove();
    tbody.selectAll("*").remove();
    container.refs.el.select(".table-note")
      .text("No service-week data loaded (serviceWeekly missing).");
    return;
  }

  // ---- Decide the table mode ----
  // Mode A: selectedWeek -> show that week (4 rows usually)
  // Mode B: timeRange && no selectedWeek -> show all rows in interval (scroll)
  // Mode C: no timeRange and no selectedWeek -> show week 1 (same as before)
  const mode = getTableMode(state);
  const currentWeek = resolveWeek(state);

  // ---- Base filter (week or range) ----
  let filtered = rows.filter(d => {
    const w = +d.week;
    if (mode === "RANGE") {
      const [w1, w2] = state.timeRange;
      return w >= +w1 && w <= +w2;
    }
    // WEEK mode
    return w === +currentWeek;
  });

  // ---- Apply state filters ----
  if (state.selectedEventType) {
    filtered = filtered.filter(d => d.eventType === state.selectedEventType);
  }
  if (state.selectedService) {
    filtered = filtered.filter(d => d.service === state.selectedService);
  }

  const hasData = filtered.length > 0;

  // ---- Columns ----
  const columns = [
    { key: "week", label: "Week", type: "num", format: v => `W${v}` },
    { key: "service", label: "Service", type: "str", format: v => prettyService(v) },
    { key: "eventType", label: "Event", type: "str", format: v => (v || "none").toUpperCase() },

    { key: "morale", label: "Morale", type: "num", format: v => fmtNumber(v, 1) },
    { key: "satisfaction", label: "Satisfaction", type: "num", format: v => fmtNumber(v, 1) },
    { key: "refusals", label: "Refusals", type: "num", format: v => fmtNumber(v, 0) },
    { key: "occupancy", label: "Occupancy", type: "num", format: v => fmtPct(v, 1) }
  ];

  // ---- Sort ----
  // Stable sort: decorate with index then tie-break on index.
  const decorated = filtered.map((d, i) => ({ d, i }));
  decorated.sort((a, b) => {
    const col = columns.find(c => c.key === sort.key) || columns[0];
    const cmp = compareByColumn(a.d, b.d, col);
    if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
    return d3.ascending(a.i, b.i);
  });
  const sortedData = decorated.map(x => x.d);

  // ---- Header render ----
  const headerRow = thead.selectAll("tr").data([null]).join("tr");

  const ths = headerRow.selectAll("th")
    .data(columns, d => d.key)
    .join("th");

  ths.each(function(col) {
    const th = d3.select(this);
    th.selectAll("*").remove();

    th.append("span").text(col.label);

    if (sort.key === col.key) {
      th.append("span")
        .attr("class", "sort-indicator")
        .text(sort.dir === "asc" ? "▲" : "▼");
    }
  });

  ths.on("click", (event, col) => {
    event.preventDefault();
    event.stopPropagation();

    if (sort.key === col.key) {
      sort.dir = (sort.dir === "asc") ? "desc" : "asc";
    } else {
      sort.key = col.key;
      // sensible default directions
      sort.dir = (col.type === "str") ? "asc" : "desc";
      if (col.key === "week") sort.dir = "asc";
    }
    update(container, data, state);
  });

  // ---- Body render ----
  const trs = tbody.selectAll("tr")
    .data(hasData ? sortedData : [], d => `${d.week}|${d.service}|${d.eventType}`);

  trs.exit().remove();

  const trsEnter = trs.enter().append("tr")
    .style("cursor", "pointer");

  const trsAll = trsEnter.merge(trs);

  // Selection styling: selected week + selected service
  trsAll.classed("selected", d => {
    const isWeek = state.selectedWeek ? (+d.week === +state.selectedWeek) : false;
    const isService = state.selectedService ? (d.service === state.selectedService) : false;
    return isWeek && isService;
  });

  // Cells
  trsAll.selectAll("td")
    .data(row => columns.map(c => ({ col: c, value: row[c.key], row })), d => d.col.key)
    .join("td")
    .text(d => d.col.format(d.value));

  // Hover tooltip + click selection
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

  // ---- Footer note ----
  const noteEl = container.refs.el.select(".table-note");

  if (!hasData) {
    // This now clearly indicates why it’s empty (range/week + filters)
    const rangeText = (mode === "RANGE" && state.timeRange)
      ? `Weeks ${state.timeRange[0]}–${state.timeRange[1]}`
      : `Week ${currentWeek}`;

    const filters = [];
    if (state.selectedEventType) filters.push(`event=${state.selectedEventType}`);
    if (state.selectedService) filters.push(`service=${prettyService(state.selectedService)}`);

    noteEl.text(`No rows for ${rangeText}${filters.length ? " • " + filters.join(", ") : ""}.`);
  } else {
    const rangeText = (mode === "RANGE" && state.timeRange)
      ? `Weeks ${state.timeRange[0]}–${state.timeRange[1]}`
      : `Week ${currentWeek}`;

    const filters = [];
    if (state.selectedEventType) filters.push(`event=${state.selectedEventType}`);
    if (state.selectedService) filters.push(`service=${prettyService(state.selectedService)}`);

    const f = filters.length ? ` • filters: ${filters.join(", ")}` : "";
    noteEl.text(`Showing ${rangeText} (${sortedData.length} row${sortedData.length === 1 ? "" : "s"})${f}`);
  }
}

// ---- Mode helpers ----
function getTableMode(state) {
  // If user explicitly selected a week, table should show that week (detail lookup).
  if (state.selectedWeek !== null && state.selectedWeek !== undefined) return "WEEK";
  // If there is a brushed range, table should expose the whole interval (scrollable).
  if (state.timeRange && Array.isArray(state.timeRange) && state.timeRange.length === 2) return "RANGE";
  // Otherwise default to a single-week view (like before).
  return "WEEK";
}

function resolveWeek(state) {
  // Primary: selectedWeek
  if (state.selectedWeek !== null && state.selectedWeek !== undefined) {
    return +state.selectedWeek;
  }
  // Fallback: midpoint of brushed timeRange
  if (state.timeRange && Array.isArray(state.timeRange) && state.timeRange.length === 2) {
    const [w1, w2] = state.timeRange;
    return Math.round((+w1 + +w2) / 2);
  }
  // Default
  return 1;
}

// ---- Sorting helpers ----
function compareByColumn(a, b, col) {
  const key = col.key;

  // Numeric columns (including occupancy)
  if (col.type === "num") {
    const an = +a[key];
    const bn = +b[key];

    const aOk = Number.isFinite(an);
    const bOk = Number.isFinite(bn);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;  // push missing to bottom
    if (!bOk) return -1;

    return d3.ascending(an, bn);
  }

  // String columns
  const as = String(a[key] ?? "");
  const bs = String(b[key] ?? "");
  return d3.ascending(as, bs);
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
