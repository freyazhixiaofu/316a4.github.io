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
    .style("cursor", "default")
    // Prevent blocking hover/tooltips on the stacked rectangles.
    .style("pointer-events", "none");

  const xScale = d3.scaleBand().padding(0.1);
  const yScale = d3.scaleLinear();
  const quantileSvg = d3.select("#quantile-chart");
  const quantileContextSvg = d3.select("#quantile-context-chart");
  const quantileWidth = parseInt(quantileSvg.style("width"), 10) || 940;
  const quantileHeight = parseInt(quantileSvg.style("height"), 10) || 620;
  const quantileContextHeight = parseInt(quantileContextSvg.style("height"), 10) || 130;
  const quantileMargin = { top: 60, right: 28, bottom: 55, left: 70 };
  const quantileContextMargin = { top: 10, right: 28, bottom: 26, left: 70 };
  const quantileInnerWidth = quantileWidth - quantileMargin.left - quantileMargin.right;
  const quantileInnerHeight = quantileHeight - quantileMargin.top - quantileMargin.bottom;
  const quantileContextInnerWidth = quantileWidth - quantileContextMargin.left - quantileContextMargin.right;
  const quantileContextInnerHeight = quantileContextHeight - quantileContextMargin.top - quantileContextMargin.bottom;
  const quantileLevels = [0.03, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.97];
  const quantileLabels = ["P3", "P5", "P10", "P25", "P50", "P75", "P90", "P95", "P97"];
  const quantileColors = {
    P3: "#0b5394",
    P5: "#f05a28",
    P10: "#f1c232",
    P25: "#458e1f",
    P50: "#8f1737",
    P75: "#6fa8dc",
    P90: "#3d550c",
    P95: "#8fce00",
    P97: "#4b1f74"
  };
  let quantileBuilt = false;
  let quantileG = null;
  let quantilePlotG = null;
  let quantileTitle = null;
  let quantileXAxisG = null;
  let quantileYAxisG = null;
  let quantileGridGX = null;
  let quantileGridGY = null;
  let quantileLineG = null;
  let quantileClipId = "quantile-focus-clip";
  let quantileContextBuilt = false;
  let quantileContextG = null;
  let quantileContextAreaG = null;
  let quantileContextAxisG = null;
  let quantileBrushG = null;
  let quantileBrush = null;
  let quantileBrushDomain = null;
  let latestQuantileSeries = [];
  let latestQuantileP50 = [];
  let latestQuantileYDomain = null;
  let xQ = null;
  let yQ = null;
  let quantileHitRect = null;
  const bisectQuantileAge = d3.bisector(d => d.age).left;

  function nearestQuantilePoint(values, age) {
    if (!values?.length) return null;
    const i = bisectQuantileAge(values, age);
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(values.length - 1, i);
    const a = values[i0];
    const b = values[i1];
    if (i0 === i1) return a;
    return Math.abs(a.age - age) <= Math.abs(b.age - age) ? a : b;
  }

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
    .text("How common within age bin");

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  const quantileTooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip quantile-tooltip")
    .style("opacity", 0)
    .style("pointer-events", "none");

  let allData = [];
  let currentGender = "All";
  let currentQuantileGender = "All";
  let cartoonGender = "All";
  let cartoonAge = 30;
  let allBinStartsGlobal = [];
  let colorMode = "cartoon"; // cartoon | gradient
  let sortMode = "height"; // height | commonness
  let drawRulerMode = false;
  let ruler = null; // { group, rect, labelText, labelBg, closeGroup }

  function formatAge(age) {
    return age.toString();
  }

  function getColor(binStart) {
    if (colorMode === "gradient") {
      const minBin = d3.min(allBinStartsGlobal);
      const maxBin = d3.max(allBinStartsGlobal);
      const t = (binStart - minBin) / Math.max(1, (maxBin - minBin));
      return d3.interpolatePlasma(t);
    }
    return colorScale(binStart);
  }

  function renderLegend() {
    const legend = d3.select("#height-legend");
    if (legend.empty()) return;

    legend.html("");
    const items = legend
      .selectAll(".legend-item")
      .data(allBinStartsGlobal)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items
      .append("span")
      .attr("class", "legend-swatch")
      .style("background", d => getColor(d))
      .style("border-color", "#111827");

    items
      .append("span")
      .attr("class", "legend-label")
      .text(d => `${d}–${d + 5} cm`);
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
    overlayHitbox
      .style("cursor", "default")
      .style("pointer-events", "none");
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

  function buildQuantileChart() {
    if (quantileSvg.empty() || quantileBuilt) return;
    quantileBuilt = true;
    quantileSvg.attr("viewBox", `0 0 ${quantileWidth} ${quantileHeight}`);

    quantileG = quantileSvg
      .append("g")
      .attr("transform", `translate(${quantileMargin.left},${quantileMargin.top})`);

    quantileTitle = quantileSvg
      .append("text")
      .attr("x", quantileWidth / 2)
      .attr("y", 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#222")
      .attr("font-size", 24)
      .attr("font-weight", 500);

    quantilePlotG = quantileG.append("g");
    quantilePlotG
      .append("defs")
      .append("clipPath")
      .attr("id", quantileClipId)
      .append("rect")
      .attr("width", quantileInnerWidth)
      .attr("height", quantileInnerHeight);

    quantileGridGX = quantileG.append("g").attr("class", "quantile-grid-x");
    quantileGridGY = quantileG.append("g").attr("class", "quantile-grid-y");

    quantileXAxisG = quantileG
      .append("g")
      .attr("transform", `translate(0,${quantileInnerHeight})`)
      .attr("class", "quantile-axis-x");
    quantileYAxisG = quantileG.append("g").attr("class", "quantile-axis-y");

    quantileLineG = quantilePlotG
      .append("g")
      .attr("class", "quantile-lines")
      .attr("clip-path", `url(#${quantileClipId})`);

    quantileG
      .append("text")
      .attr("x", quantileInnerWidth / 2)
      .attr("y", quantileInnerHeight + 42)
      .attr("fill", "#222")
      .attr("text-anchor", "middle")
      .attr("font-size", 16)
      .text("Age (Years)");

    quantileG
      .append("text")
      .attr("x", -quantileInnerHeight / 2)
      .attr("y", -45)
      .attr("transform", "rotate(-90)")
      .attr("fill", "#222")
      .attr("text-anchor", "middle")
      .attr("font-size", 16)
      .text("Stature (cm)");

    // Above grid/axes in paint order so pointer events reach the overlay (not the grid lines).
    quantileHitRect = quantileG
      .append("rect")
      .attr("class", "quantile-hit-overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", quantileInnerWidth)
      .attr("height", quantileInnerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", event => {
        if (!latestQuantileSeries.length || !xQ || !yQ) return;
        const [px, py] = d3.pointer(event, quantileG.node());
        const [a0, a1] = xQ.domain();
        const age = xQ.invert(px);
        if (age < a0 || age > a1) {
          quantileTooltip.style("opacity", 0);
          return;
        }
        let best = null;
        let bestDist = Infinity;
        for (const s of latestQuantileSeries) {
          const pt = nearestQuantilePoint(s.values, age);
          if (!pt || pt.stature == null) continue;
          const lineY = yQ(pt.stature);
          const dist = Math.abs(lineY - py);
          if (dist < bestDist) {
            bestDist = dist;
            best = { key: s.key, point: pt };
          }
        }
        const maxDist = 24;
        if (!best || bestDist > maxDist) {
          quantileTooltip.style("opacity", 0);
          return;
        }
        quantileTooltip
          .style("opacity", 1)
          .html(
            `<strong>${best.key}</strong><br/>${Number(best.point.stature).toFixed(1)} cm`
          )
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 10}px`);
      })
      .on("mouseleave", () => {
        quantileTooltip.style("opacity", 0);
      });
  }

  function buildQuantileContextChart() {
    if (quantileContextSvg.empty() || quantileContextBuilt) return;
    quantileContextBuilt = true;
    quantileContextSvg.attr("viewBox", `0 0 ${quantileWidth} ${quantileContextHeight}`);

    quantileContextG = quantileContextSvg
      .append("g")
      .attr("transform", `translate(${quantileContextMargin.left},${quantileContextMargin.top})`);

    quantileContextAreaG = quantileContextG.append("g").attr("class", "quantile-context-area");
    quantileContextAxisG = quantileContextG
      .append("g")
      .attr("transform", `translate(0,${quantileContextInnerHeight})`)
      .attr("class", "quantile-context-axis-x");

    quantileBrush = d3
      .brushX()
      .extent([[0, 0], [quantileContextInnerWidth, quantileContextInnerHeight]])
      .on("brush end", (event) => {
        if (!latestQuantileSeries.length) return;
        if (!event.selection) {
          quantileBrushDomain = null;
        } else {
          const [x0, x1] = event.selection;
          const contextScale = d3.scaleLinear().domain([2, 80]).range([0, quantileContextInnerWidth]);
          quantileBrushDomain = [contextScale.invert(x0), contextScale.invert(x1)];
        }
        renderQuantileFocus(latestQuantileSeries);
      });

    quantileBrushG = quantileContextG.append("g").attr("class", "quantile-brush").call(quantileBrush);
  }

  function renderQuantileFocus(series) {
    if (!series.length || !latestQuantileYDomain || !quantileBuilt) return;
    const [globalYMin, globalYMax] = latestQuantileYDomain;
    const domain = quantileBrushDomain
      ? [Math.max(2, quantileBrushDomain[0]), Math.min(80, quantileBrushDomain[1])]
      : [2, 80];
    if (domain[1] - domain[0] < 1) {
      const center = (domain[0] + domain[1]) / 2;
      domain[0] = Math.max(2, center - 0.5);
      domain[1] = Math.min(80, center + 0.5);
    }

    xQ = d3.scaleLinear().domain(domain).range([0, quantileInnerWidth]);
    yQ = d3.scaleLinear().domain([globalYMin, globalYMax]).range([quantileInnerHeight, 0]);

    const span = domain[1] - domain[0];
    const xTickStep = span <= 14 ? 1 : span <= 30 ? 2 : 5;

    quantileGridGX
      .call(
        d3.axisBottom(xQ)
          .tickValues(d3.range(Math.ceil(domain[0]), Math.floor(domain[1]) + 1, xTickStep))
          .tickSize(quantileInnerHeight)
          .tickFormat("")
      )
      .attr("transform", "translate(0,0)");
    quantileGridGY
      .call(d3.axisLeft(yQ).tickValues(d3.range(globalYMin, globalYMax + 1, 10)).tickSize(-quantileInnerWidth).tickFormat(""));

    quantileGridGX.selectAll("line").attr("stroke", "#b8b8b8").attr("stroke-opacity", 0.7);
    quantileGridGX.select(".domain").remove();
    quantileGridGY.selectAll("line").attr("stroke", "#a7a7a7").attr("stroke-opacity", 0.85);
    quantileGridGY.select(".domain").remove();

    quantileXAxisG.call(
      d3.axisBottom(xQ).tickValues(d3.range(Math.ceil(domain[0] / xTickStep) * xTickStep, Math.floor(domain[1]) + 1, xTickStep))
    );
    quantileYAxisG.call(d3.axisLeft(yQ).tickValues(d3.range(globalYMin, globalYMax + 1, 20)));
    quantileXAxisG.selectAll("text").attr("fill", "#222").attr("font-size", 12);
    quantileYAxisG.selectAll("text").attr("fill", "#222").attr("font-size", 12);
    quantileXAxisG.selectAll("line, path").attr("stroke", "#6f6f6f");
    quantileYAxisG.selectAll("line, path").attr("stroke", "#6f6f6f");

    const line = d3
      .line()
      .x(d => xQ(d.age))
      .y(d => yQ(d.stature))
      .curve(d3.curveMonotoneX);

    const lines = quantileLineG.selectAll(".quantile-line").data(series, d => d.key);
    lines
      .enter()
      .append("path")
      .attr("class", "quantile-line")
      .merge(lines)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", 4)
      .attr("d", d => line(d.values));
    lines.exit().remove();

    if (quantileHitRect) quantileHitRect.raise();
  }


  function renderQuantileContext(p50Values, yDomain) {
    if (!quantileContextBuilt || !p50Values.length) return;
    const xContext = d3.scaleLinear().domain([2, 80]).range([0, quantileContextInnerWidth]);
    const yContext = d3.scaleLinear().domain(yDomain).range([quantileContextInnerHeight, 0]);

    const area = d3.area()
      .x(d => xContext(d.age))
      .y0(quantileContextInnerHeight)
      .y1(d => yContext(d.stature))
      .curve(d3.curveMonotoneX);

    const contextPath = quantileContextAreaG.selectAll(".quantile-context-path").data([p50Values]);
    contextPath
      .enter()
      .append("path")
      .attr("class", "quantile-context-path")
      .merge(contextPath)
      .attr("fill", "#b9b9b9")
      .attr("opacity", 0.8)
      .attr("d", area);
    contextPath.exit().remove();

    quantileContextAxisG.call(d3.axisBottom(xContext).tickValues(d3.range(5, 81, 5)));
    quantileContextAxisG.selectAll("text").attr("fill", "#333").attr("font-size", 11);
    quantileContextAxisG.selectAll("line, path").attr("stroke", "#6f6f6f");

    if (!quantileBrushDomain) {
      quantileBrushG.call(quantileBrush.move, null);
    } else {
      const brushPixels = quantileBrushDomain.map(v => xContext(v));
      quantileBrushG.call(quantileBrush.move, brushPixels);
    }
  }

  function weightedQuantile(sortedPairs, q) {
    const total = d3.sum(sortedPairs, d => d.count);
    if (!total) return null;
    const target = q * total;
    let cumulative = 0;
    for (const point of sortedPairs) {
      cumulative += point.count;
      if (cumulative >= target) return point.height_cm;
    }
    return sortedPairs[sortedPairs.length - 1]?.height_cm ?? null;
  }

  function quantileSeriesFromData(data) {
    const byAge = d3.group(data, d => d.age_bin);
    const ages = Array.from(byAge.keys()).filter(a => a >= 2 && a <= 80).sort((a, b) => a - b);
    return quantileLevels.map((level, index) => ({
      key: quantileLabels[index],
      color: quantileColors[quantileLabels[index]],
      values: ages.map(age => {
        const sortedPairs = (byAge.get(age) || [])
          .map(d => ({ height_cm: d.height_cm, count: d.count }))
          .sort((a, b) => a.height_cm - b.height_cm);
        return { age, stature: weightedQuantile(sortedPairs, level) };
      }).filter(d => d.stature !== null)
    }));
  }

  function updateQuantileChart(gender) {
    buildQuantileChart();
    buildQuantileContextChart();
    if (!quantileBuilt) return;

    const data = getFilteredData(gender);
    const series = quantileSeriesFromData(data);
    const allPoints = series.flatMap(s => s.values);
    if (!allPoints.length) return;

    const yMin = Math.floor((d3.min(allPoints, d => d.stature) - 5) / 5) * 5;
    const yMax = Math.ceil((d3.max(allPoints, d => d.stature) + 5) / 5) * 5;
    latestQuantileYDomain = [yMin, yMax];
    latestQuantileSeries = series;
    latestQuantileP50 = series.find(s => s.key === "P50")?.values || [];

    quantileTitle.text(`${gender === "All" ? "All Genders" : gender} Stature vs Age`);
    renderQuantileFocus(series);
    renderQuantileContext(latestQuantileP50, latestQuantileYDomain);
    renderQuantileLegendHtml(series);
  }

  function renderQuantileLegendHtml(series) {
    const el = document.getElementById("quantile-chart-legend");
    if (!el) return;
    el.innerHTML = series
      .map(
        s =>
          `<div class="quantile-legend-item"><span class="quantile-legend-swatch" style="background:${s.color}"></span><span>${s.key}</span></div>`
      )
      .join("");
  }

  function staturesAtCartoonAge(age, gender) {
    const data = getFilteredData(gender);
    const series = quantileSeriesFromData(data);
    const a = Math.round(clamp(age, 2, 80));
    return quantileLabels
      .map(label => {
        const s = series.find(x => x.key === label);
        if (!s) return null;
        const pt = nearestQuantilePoint(s.values, a);
        return pt && pt.stature != null
          ? { key: label, color: quantileColors[label], stature: pt.stature, age: a }
          : null;
      })
      .filter(Boolean);
  }

  function updateCartoonSidebar() {
    const stage = document.getElementById("cartoon-stage");
    const ageVal = document.getElementById("cartoon-age-value");
    if (!stage) return;
    if (!allData.length) {
      stage.innerHTML = "";
      return;
    }
    const age = Math.round(clamp(+cartoonAge, 2, 80));
    cartoonAge = age;
    if (ageVal) ageVal.textContent = String(age);
    const rangeInput = document.getElementById("cartoon-age");
    if (rangeInput) rangeInput.value = String(age);

    const rows = staturesAtCartoonAge(age, cartoonGender);
    if (!rows.length) {
      stage.innerHTML = '<p class="cartoon-empty">No data for this selection.</p>';
      return;
    }
    const sMin = d3.min(rows, d => d.stature);
    const sMax = d3.max(rows, d => d.stature);
    const hScale =
      sMax - sMin < 0.5
        ? () => 130
        : d3.scaleLinear().domain([sMin, sMax]).range([68, 200]);

    const genderMod =
      cartoonGender === "Male" ? "cartoon-stage--male" : cartoonGender === "Female" ? "cartoon-stage--female" : "cartoon-stage--all";
    stage.className = `cartoon-stage ${genderMod}`;

    stage.innerHTML = rows
      .map((r, i) => {
        const h = Math.round(hScale(r.stature));
        const delay = (i * 0.12).toFixed(2);
        return `
      <div class="cartoon-figure-wrap" style="--sway-delay:${delay}s" title="${r.key}: ${r.stature.toFixed(1)} cm at age ${r.age}">
        <span class="cartoon-figure-label">${r.key}</span>
        <div class="cartoon-figure" style="height:${h}px">
          <svg class="cartoon-figure-svg" viewBox="0 0 50 140" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
            <circle class="cartoon-head" cx="25" cy="20" r="15" fill="${r.color}" stroke="#111827" stroke-width="2.2"/>
            <path d="M25 36 L25 82" stroke="#111827" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M25 50 L10 68 M25 50 L40 68" stroke="#111827" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M25 82 L17 132 M25 82 L33 132" stroke="#111827" stroke-width="4.2" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="cartoon-cm">${r.stature.toFixed(0)}</span>
      </div>`;
      })
      .join("");

    const cap = document.getElementById("cartoon-caption");
    if (cap) {
      const p50 = rows.find(r => r.key === "P50");
      cap.textContent = p50
        ? `${cartoonGender === "All" ? "All genders" : cartoonGender}, age ${age}: median about ${p50.stature.toFixed(1)} cm (NHANES-based quantiles).`
        : "";
    }
  }

  function setupCartoonSidebar() {
    const rangeInput = document.getElementById("cartoon-age");
    if (rangeInput) {
      cartoonAge = +rangeInput.value || 30;
      rangeInput.addEventListener("input", () => {
        cartoonAge = +rangeInput.value;
        updateCartoonSidebar();
      });
    }

    const buttons = d3.selectAll(".cartoon-gender-toggle");
    if (buttons.empty()) return;
    buttons.on("click", function () {
      const g = this.getAttribute("data-cartoon-gender");
      if (!g) return;
      cartoonGender = g;
      buttons.classed("active", false);
      d3.select(this).classed("active", true);
      updateCartoonSidebar();
    });
  }

  function setupQuantileButton() {
    const button = document.getElementById("quantile-view-button");
    const card = document.getElementById("quantile-chart-card");
    if (!button || !card) return;
    button.addEventListener("click", () => {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setupQuantileGenderButtons() {
    const buttons = d3.selectAll(".quantile-gender-toggle");
    if (buttons.empty()) return;
    buttons.on("click", function () {
      const gender = this.getAttribute("data-quantile-gender");
      if (!gender) return;
      currentQuantileGender = gender;
      buttons.classed("active", false);
      d3.select(this).classed("active", true);
      updateQuantileChart(currentQuantileGender);
    });
  }

  function updateChart(gender) {
    currentGender = gender;
    const data = getFilteredData(gender);
    updateQuantileChart(currentQuantileGender);

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
      }));

      if (sortMode === "commonness") {
        bins.sort((a, b) => {
          if (b.percent !== a.percent) return b.percent - a.percent;
          return a.binStart - b.binStart;
        });
      } else {
        bins.sort((a, b) => a.binStart - b.binStart);
      }

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
      .attr("fill", d => getColor(d.binStart))
      .attr("opacity", 0.95)
      .on("mouseover", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `Age bin: ${d.age_bin}<br/>` +
              `Height: ${d.binStart}–${d.binEnd} cm<br/>` +
              `How common: ${(d.percent * 100).toFixed(1)}%` +
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
      .attr("fill", d => getColor(d.binStart))
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

  function setupViewButtons() {
    const colorBtn = document.getElementById("color-mode-toggle");
    const sortBtn = document.getElementById("sort-mode-toggle");
    if (!colorBtn || !sortBtn) return;

    colorBtn.addEventListener("click", () => {
      colorMode = colorMode === "cartoon" ? "gradient" : "cartoon";
      colorBtn.textContent = `Color: ${colorMode === "cartoon" ? "Cartoon" : "Gradient"}`;
      renderLegend();
      updateChart(currentGender);
    });

    sortBtn.addEventListener("click", () => {
      sortMode = sortMode === "height" ? "commonness" : "height";
      sortBtn.textContent = `Sort: ${sortMode === "height" ? "Height" : "How common"}`;
      updateChart(currentGender);
    });
  }

  function setupRulerTools() {
    const drawBtn = document.getElementById("ruler-draw");
    const removeBtn = document.getElementById("ruler-remove");
    if (!drawBtn || !removeBtn) return;

    drawBtn.addEventListener("click", () => {
      drawRulerMode = !drawRulerMode;
      overlayHitbox
        .style("cursor", drawRulerMode ? "crosshair" : "default")
        .style("pointer-events", drawRulerMode ? "all" : "none");
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
      overlayHitbox
        .style("cursor", "default")
        .style("pointer-events", "none");
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

    // Stable mapping: each 5cm height bin always gets the same color
    const toBinStart = h => 5 * Math.floor(h / 5);
    allBinStartsGlobal = Array.from(new Set(allData.map(d => toBinStart(d.height_cm)))).sort((a, b) => a - b);
    colorScale.domain(allBinStartsGlobal);

    renderLegend();

    setupGenderButtons();
    setupViewButtons();
    setupRulerTools();
    setupQuantileButton();
    setupQuantileGenderButtons();
    setupCartoonSidebar();
    updateCartoonSidebar();
    updateChart(currentGender);
  });
})();
