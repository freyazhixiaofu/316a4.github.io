(function () {
  const svg = d3.select("#height-chart");
  const width = parseInt(svg.style("width"), 10) || 900;
  const height = parseInt(svg.style("height"), 10) || 520;
  const margin = { top: 30, right: 20, bottom: 60, left: 60 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Overlay layer for drawing/dragging "cartoon ruler"
  const overlay = g.append("g").attr("class", "overlay-layer");
  const overlayHitbox = overlay
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .style("pointer-events", "all");

  const xScale = d3.scaleBand().padding(0.1);
  const yScale = d3.scaleLinear();

  // Distinct "cartoon" palette (no gradients)
  const CARTOON_COLORS = [
    "#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93",
    "#ff924c", "#ffd6a5", "#caffbf", "#9bf6ff", "#a0c4ff",
    "#bdb2ff", "#ffc6ff", "#f72585", "#b5179e", "#7209b7",
    "#3a0ca3", "#4361ee", "#4cc9f0", "#2ec4b6", "#f77f00",
    "#d62828", "#00b4d8", "#52b788", "#ef476f"
  ];

  const colorScale = d3.scaleOrdinal(CARTOON_COLORS);

  const xAxisGroup = g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${innerHeight})`);
  const yAxisGroup = g.append("g").attr("class", "axis y-axis");

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 40)
    .attr("fill", "#c0caf5")
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .text("Age (binned)");

  g.append("text")
    .attr("x", -innerHeight / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("fill", "#c0caf5")
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .text("Share within age bin");

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  let allData = [];
  let currentGender = "All";
  let drawRulerMode = false;
  let ruler = null; // { group, rect, labelText, labelBg, closeGroup }

  function formatAge(age) {
    return age.toString();
  }

  function setRulerButtons() {
    const drawBtn = document.getElementById("ruler-draw");
    const removeBtn = document.getElementById("ruler-remove");
    if (!drawBtn || !removeBtn) return;

    drawBtn.classList.toggle("active", drawRulerMode);
    removeBtn.disabled = !ruler;
  }

  function removeRuler() {
    if (ruler) {
      ruler.group.remove();
      ruler = null;
    }
    drawRulerMode = false;
    overlayHitbox.style("cursor", "default");
    setRulerButtons();
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function updateRulerLabel() {
    if (!ruler) return;
    const x = +ruler.rect.attr("x");
    const y = +ruler.rect.attr("y");
    const w = +ruler.rect.attr("width");
    const h = +ruler.rect.attr("height");

    const percentHeight = clamp((h / innerHeight) * 100, 0, 100);
    const label = `${percentHeight.toFixed(1)}% tall`;

    ruler.labelText.text(label);
    const bbox = ruler.labelText.node().getBBox();
    const labelW = bbox.width + 16;
    const labelH = bbox.height + 10;

    // place label at upper-left of ruler (outside if possible)
    let lx = x - labelW - 8;
    let ly = y - labelH - 8;
    // keep it inside the plot area
    lx = clamp(lx, 0, innerWidth - labelW);
    ly = clamp(ly, 0, innerHeight - labelH);

    ruler.labelBg
      .attr("x", lx)
      .attr("y", ly)
      .attr("width", labelW)
      .attr("height", labelH);
    ruler.labelText
      .attr("x", lx + 8)
      .attr("y", ly + 8 + bbox.height - 2);

    ruler.closeGroup.attr("transform", `translate(${x + w - 14},${y + 14})`);
  }

  function attachRulerDrag() {
    if (!ruler) return;
    ruler.group.call(
      d3.drag().on("drag", (event) => {
        const w = +ruler.rect.attr("width");
        const h = +ruler.rect.attr("height");
        const newX = clamp((+ruler.rect.attr("x")) + event.dx, 0, innerWidth - w);
        const newY = clamp((+ruler.rect.attr("y")) + event.dy, 0, innerHeight - h);
        ruler.rect.attr("x", newX).attr("y", newY);
        updateRulerLabel();
      })
    );
  }

  function createRuler(x0, y0, x1, y1) {
    // normalize
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);

    const group = overlay.append("g").attr("class", "ruler-group");
    const rect = group.append("rect").attr("class", "ruler-rect");
    const labelBg = group.append("rect").attr("class", "ruler-label-bg");
    const labelText = group.append("text").attr("class", "ruler-label");

    const closeGroup = group.append("g").attr("class", "ruler-close");
    closeGroup.append("circle").attr("r", 10);
    closeGroup.append("text").text("×").attr("y", 1);
    closeGroup.on("click", (event) => {
      event.stopPropagation();
      removeRuler();
    });

    ruler = { group, rect, labelBg, labelText, closeGroup };
    rect.attr("x", x).attr("y", y).attr("width", w).attr("height", h);
    updateRulerLabel();
    attachRulerDrag();
    // ensure ruler is always on top of stacks/axes
    overlay.raise();
    setRulerButtons();
  }

  function getFilteredData(gender) {
    if (gender === "All") {
      // combine male + female by summing counts, then recompute percent per age_bin
      const merged = d3.rollups(
        allData,
        v => d3.sum(v, d => d.count),
        d => d.age_bin,
        d => d.height_cm
      ).flatMap(([age_bin, heights]) =>
        heights.map(([height_cm, count]) => ({ age_bin, height_cm, count }))
      );

      const totalByAge = d3.rollup(
        merged,
        v => d3.sum(v, d => d.count),
        d => d.age_bin
      );

      merged.forEach(d => {
        d.percent = d.count / (totalByAge.get(d.age_bin) || 1);
      });

      return merged;
    }
    return allData.filter(d => d.gender === gender);
  }

  function updateChart(gender) {
    currentGender = gender;
    const data = getFilteredData(gender);

    const ages = Array.from(new Set(data.map(d => d.age_bin))).sort((a, b) => a - b);
    const heightMin = d3.min(data, d => d.height_cm);
    const heightMax = d3.max(data, d => d.height_cm);

    xScale.domain(ages).range([0, innerWidth]);
    // y axis is cumulative share (0 to 1)
    yScale.domain([0, 1]).range([innerHeight, 0]);
    // domain is all 5cm binStarts we will draw (set below after stacking)

    const bandWidth = xScale.bandwidth();
    const rectWidth = Math.max(4, bandWidth * 0.9);

    xAxisGroup
      .transition()
      .duration(500)
      .call(
        d3
          .axisBottom(xScale)
          // show all youth bins; show decade midpoints (25,35,...) for adults
          .tickValues(ages.filter(a => a < 20 || a % 10 === 5))
          .tickFormat(formatAge)
      );

    yAxisGroup
      .transition()
      .duration(500)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat(d => `${Math.round(d * 100)}%`)
      );

    // Group heights into 5 cm bins (e.g., 100–105, 105–110, ...)
    const byAge = d3.group(data, d => d.age_bin);
    const stacked = [];

    byAge.forEach((values, age) => {
      // aggregate cm-level data into 5cm bins
      const binMap = d3.rollup(
        values,
        v => d3.sum(v, d => d.percent),
        d => 5 * Math.floor(d.height_cm / 5) // bin start
      );

      const bins = Array.from(binMap, ([binStart, percent]) => ({
        binStart,
        binEnd: binStart + 5,
        percent
      })).sort((a, b) => a.binStart - b.binStart);

      let cumulative = 0;
      bins.forEach(b => {
        const y0 = cumulative;
        const y1 = cumulative + b.percent;
        cumulative = y1;
        stacked.push({
          age_bin: age,
          binStart: b.binStart,
          binEnd: b.binEnd,
          percent: b.percent,
          y0,
          y1
        });
      });
    });

    // Set color domain to all binStarts (stable mapping)
    const allBinStarts = Array.from(new Set(stacked.map(d => d.binStart))).sort((a, b) => a - b);
    colorScale.domain(allBinStarts);

    const cells = g.selectAll(".rect-cell").data(
      stacked,
      d => `${d.age_bin}-${d.binStart}-${gender}`
    );

    cells
      .enter()
      .append("rect")
      .attr("class", "rect-cell")
      .attr("x", d => (xScale(d.age_bin) ?? 0) + (bandWidth - rectWidth) / 2)
      .attr("width", rectWidth)
      .attr("y", d => yScale(d.y1))
      .attr("height", 0)
      .attr("fill", d => colorScale(d.binStart))
      .attr("opacity", 0.95)
      .on("mouseover", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `Age bin: ${d.age_bin}<br/>` +
              `Height: ${d.binStart}–${d.binEnd} cm<br/>` +
              `Share: ${(d.percent * 100).toFixed(1)}%` +
              `<br/>Cumulative: ${(d.y1 * 100).toFixed(1)}%`
          )
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mousemove", event => {
        tooltip.style("left", event.pageX + 10 + "px").style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
      })
      .transition()
      .duration(500)
      .attr("height", d => yScale(d.y0) - yScale(d.y1))
      .attr("opacity", 0.95);

    cells
      .transition()
      .duration(500)
      .attr("x", d => (xScale(d.age_bin) ?? 0) + (bandWidth - rectWidth) / 2)
      .attr("width", rectWidth)
      .attr("y", d => yScale(d.y1))
      .attr("height", d => yScale(d.y0) - yScale(d.y1))
      .attr("fill", d => colorScale(d.binStart))
      .attr("opacity", 0.95);

    cells
      .exit()
      .transition()
      .duration(300)
      .attr("opacity", 0)
      .remove();

    // keep overlay layer (ruler) above chart stacks
    overlay.raise();
  }

  function setupGenderButtons() {
    const buttons = d3.selectAll(".gender-toggle");
    buttons.on("click", function () {
      const gender = this.getAttribute("data-gender");
      buttons.classed("active", false);
      d3.select(this).classed("active", true);
      updateChart(gender);
    });
  }

  function setupRulerTools() {
    const drawBtn = document.getElementById("ruler-draw");
    const removeBtn = document.getElementById("ruler-remove");
    if (!drawBtn || !removeBtn) return;

    drawBtn.addEventListener("click", () => {
      drawRulerMode = !drawRulerMode;
      overlayHitbox.style("cursor", drawRulerMode ? "crosshair" : "default");
      setRulerButtons();
    });

    removeBtn.addEventListener("click", () => removeRuler());

    let drawing = false;
    let start = null;

    overlayHitbox.on("pointerdown", (event) => {
      if (!drawRulerMode) return;
      event.preventDefault();
      if (ruler) removeRuler(); // single ruler at a time
      drawing = true;
      // Capture pointer so drawing continues even if cursor
      // moves over other SVG elements or outside the hitbox.
      const node = overlayHitbox.node();
      if (node && node.setPointerCapture) {
        try {
          node.setPointerCapture(event.pointerId);
        } catch (_) {
          // ignore if capture fails
        }
      }
      const [mx, my] = d3.pointer(event, g.node());
      start = [clamp(mx, 0, innerWidth), clamp(my, 0, innerHeight)];
      createRuler(start[0], start[1], start[0] + 1, start[1] + 1);
    });

    overlayHitbox.on("pointermove", (event) => {
      if (!drawRulerMode || !drawing || !start || !ruler) return;
      const [mx, my] = d3.pointer(event, g.node());
      const x1 = clamp(mx, 0, innerWidth);
      const y1 = clamp(my, 0, innerHeight);
      const x0 = start[0];
      const y0 = start[1];
      const x = Math.min(x0, x1);
      const y = Math.min(y0, y1);
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      ruler.rect.attr("x", x).attr("y", y).attr("width", w).attr("height", h);
      updateRulerLabel();
    });

    const finish = () => {
      if (!drawing) return;
      drawing = false;
      start = null;
      drawRulerMode = false;
      overlayHitbox.style("cursor", "default");
      setRulerButtons();
    };

    overlayHitbox.on("pointerup", finish);
    overlayHitbox.on("pointercancel", finish);
  }

  d3.json("data/height_distributions_by_age_gender.json").then(json => {
    allData = json.map(d => ({
      age_bin: +d.age_bin,
      gender: d.gender,
      height_cm: +d.height_cm,
      count: +d.count,
      percent: +d.percent
    }));

    setupGenderButtons();
    setupRulerTools();
    updateChart(currentGender);
  });
})();
