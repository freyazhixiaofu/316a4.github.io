(function () {
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

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

  const quantileTooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip quantile-tooltip")
    .style("opacity", 0)
    .style("pointer-events", "none");

  let allData = [];
  let currentQuantileGender = "All";
  let cartoonGender = "All";
  let cartoonAge = 30;

  function getFilteredData(gender) {
    if (gender === "All") {
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
      .on("brush end", event => {
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

    const area = d3
      .area()
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

  /** Tight viewBox around stick figure: head top (y=5) through feet (y≈132) — matches ruler pixel height. */
  const FIGURE_VIEWBOX = "0 5 50 127";

  /** Feet at cm=0 (bottom); top of chart = H_CEILING cm. */
  function statureToY(stature, hMaxCm, plotH) {
    const cap = Math.max(hMaxCm, 1e-6);
    const s = Math.min(Math.max(stature, 0), cap);
    return plotH * ((cap - s) / cap);
  }

  function statureToHeightPx(stature, hMaxCm, plotH) {
    const cap = Math.max(hMaxCm, 1e-6);
    const s = Math.min(Math.max(stature, 0), cap);
    return plotH * (s / cap);
  }

  /**
   * Ruler 0…H_CEILING cm + horizontal head guides. viewBox width = rulerW + n * colW.
   */
  function buildCartoonMeasureSvg(rows, hMaxCm, plotH, rulerW, colW) {
    const n = rows.length;
    const totalW = rulerW + n * colW;
    const yAt = cm => statureToY(cm, hMaxCm, plotH);

    const tickParts = [];
    for (let cm = 0; cm <= hMaxCm; cm++) {
      const y = yAt(cm);
      if (y < -0.5 || y > plotH + 0.5) continue;
      const isTen = cm % 10 === 0;
      const isFive = cm % 5 === 0;
      const tickLen = isTen ? 16 : isFive ? 10 : 5;
      const stroke = isTen ? "#1e293b" : isFive ? "#64748b" : "#cbd5e1";
      const sw = isTen ? 1.45 : isFive ? 1.1 : 0.85;
      tickParts.push(
        `<line x1="${rulerW - tickLen}" y1="${y}" x2="${rulerW}" y2="${y}" stroke="${stroke}" stroke-width="${sw}" />`
      );
      if (isTen) {
        const ty = cm === 0 ? plotH - 4 : y + 3.5;
        tickParts.push(
          `<text x="${rulerW - tickLen - 4}" y="${ty}" text-anchor="end" class="cartoon-ruler-tick-label">${cm}</text>`
        );
      }
    }

    const headLines = rows.map((r, i) => {
      const y = yAt(r.stature);
      const x0 = rulerW;
      const x1 = rulerW + i * colW + colW * 0.5;
      return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${r.color}" stroke-width="2" stroke-opacity="0.95" stroke-linecap="round" />`;
    });

    return `<svg class="cartoon-measure-svg" viewBox="0 0 ${totalW} ${plotH}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="cartoon-ruler-hatch" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 4 L4 0" stroke="#e2e8f0" stroke-width="0.6"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="${rulerW}" height="${plotH}" fill="#faf8f5" stroke="#cbd5e1" stroke-width="1.2"/>
      <rect x="0" y="0" width="${rulerW}" height="${plotH}" fill="url(#cartoon-ruler-hatch)" opacity="0.35"/>
      <line x1="${rulerW}" y1="0" x2="${rulerW}" y2="${plotH}" stroke="#0f172a" stroke-width="2.2"/>
      <line x1="${rulerW}" y1="${plotH}" x2="${totalW}" y2="${plotH}" stroke="#0f172a" stroke-width="2" />
      <text x="6" y="14" class="cartoon-ruler-title">cm</text>
      ${tickParts.join("")}
      ${headLines.join("")}
    </svg>`;
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
    const tallest = d3.max(rows, d => d.stature);
    const hMaxCm = Math.min(250, Math.max(200, Math.ceil(tallest / 5) * 5 + 30));

    const plotH = 300;
    const rulerW = 48;
    const n = rows.length;
    const colW = 56;
    const totalW = rulerW + n * colW;

    const genderMod =
      cartoonGender === "Male"
        ? "cartoon-stage--male"
        : cartoonGender === "Female"
          ? "cartoon-stage--female"
          : "cartoon-stage--all";
    stage.className = `cartoon-stage ${genderMod}`;

    const measureSvg = buildCartoonMeasureSvg(rows, hMaxCm, plotH, rulerW, colW);

    const labelRow = `
      <div class="cartoon-label-row">
        <div class="cartoon-label-ruler-gap" aria-hidden="true"></div>
        ${rows.map(r => `<span class="cartoon-figure-label">${r.key}</span>`).join("")}
      </div>`;

    const figuresOverlay = `<div class="cartoon-overlay-ruler-cell" aria-hidden="true"></div>${rows
      .map((r, i) => {
        const hPx = Math.max(10, Math.round(statureToHeightPx(r.stature, hMaxCm, plotH)));
        const delay = (i * 0.12).toFixed(2);
        return `
      <div class="cartoon-figure-slot" style="--sway-delay:${delay}s" title="${r.key}: ${r.stature.toFixed(1)} cm at age ${r.age}">
        <div class="cartoon-figure" style="height:${hPx}px">
          <svg class="cartoon-figure-svg" viewBox="${FIGURE_VIEWBOX}" preserveAspectRatio="none" aria-hidden="true">
            <circle class="cartoon-head" cx="25" cy="20" r="15" fill="${r.color}" stroke="#111827" stroke-width="2.2"/>
            <path d="M25 36 L25 82" stroke="#111827" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M25 50 L10 68 M25 50 L40 68" stroke="#111827" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M25 82 L17 132 M25 82 L33 132" stroke="#111827" stroke-width="4.2" stroke-linecap="round"/>
          </svg>
        </div>
      </div>`;
      })
      .join("")}`;

    const cmRow = `
      <div class="cartoon-cm-row">
        <div class="cartoon-cm-ruler-gap" aria-hidden="true"></div>
        ${rows.map(r => `<span class="cartoon-cm">${r.stature.toFixed(0)} cm</span>`).join("")}
      </div>`;

    stage.innerHTML = `
      <div class="cartoon-measure">
        ${labelRow}
        <div class="cartoon-chart-wrap" style="height:${plotH}px">
          ${measureSvg}
          <div class="cartoon-figure-overlay">${figuresOverlay}</div>
        </div>
        ${cmRow}
      </div>`;

    const cap = document.getElementById("cartoon-caption");
    if (cap) {
      const p50 = rows.find(r => r.key === "P50");
      cap.textContent = p50
        ? `${cartoonGender === "All" ? "All genders" : cartoonGender}, age ${age}: median about ${p50.stature.toFixed(1)} cm. Cartoon scale 0–${hMaxCm} cm (feet at 0).`
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

  d3.json("data/height_distributions_by_age_gender.json").then(json => {
    allData = json.map(d => ({
      age_bin: +d.age_bin,
      gender: d.gender,
      height_cm: +d.height_cm,
      count: +d.count,
      percent: +d.percent
    }));

    setupQuantileGenderButtons();
    setupCartoonSidebar();
    updateQuantileChart(currentQuantileGender);
    updateCartoonSidebar();
  });
})();
