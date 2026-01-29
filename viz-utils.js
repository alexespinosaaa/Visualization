// viz-utils.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function getInnerSize(container, margin, minHeight = 220) {
  const rect = container.getBoundingClientRect();

  // panel padding is already applied in CSS; rect includes it, which is what we want
  const width = Math.max(320, rect.width - margin.left - margin.right);

  // If the panel has a min-height, rect.height is usually reliable.
  // Guarantee a usable height so charts never collapse.
  const height = Math.max(minHeight, rect.height - margin.top - margin.bottom);

  return { width, height };
}

export function ensureSVG(containerSel) {
  // create or reuse ONE svg per panel
  let svg = containerSel.select("svg");
  if (svg.empty()) svg = containerSel.append("svg");
  return svg;
}

export function makeRootG(svg, margin) {
  let g = svg.select("g.root");
  if (g.empty()) g = svg.append("g").attr("class", "root");
  g.attr("transform", `translate(${margin.left},${margin.top})`);
  return g;
}

export function observeResize(domNode, callback) {
  const ro = new ResizeObserver(() => callback());
  ro.observe(domNode);
  return ro;
}
