/* =========================
   Global dims & helpers
========================= */
const mapWidth = 800;
const mapHeight = 400;
const chartWidth = 800;
const chartHeight = 400;
const TOP_PAD = 72;

/* ---------- Formatting helpers ---------- */
function formatSci(val, digits = 2) {
  if (val == null || isNaN(val)) return "—";
  if (val === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(val)));
  const mant = val / Math.pow(10, exp);
  const m = mant.toFixed(digits);
  const sign = exp >= 0 ? "" : "−";
  const absExp = Math.abs(exp);
  return `${m}×10` + `<span class="sup">${sign}${absExp}</span>`;
}
function fmtNum(val, digits = 2) {
  return (val == null || isNaN(val)) ? "—" : (+val).toFixed(digits);
}
function formatDelta(val, digits = 2) {
  if (val == null || isNaN(val)) return "—";
  const s = (+val).toFixed(digits);
  return (+val > 0 ? `+${s}` : s);
}
function formatSciDelta(val, digits = 2) {
  if (val == null || isNaN(val)) return "—";
  const html = formatSci(val, digits);
  return (+val > 0 ? `+${html}` : html);
}

/* ---------- Loader ---------- */
function showLoader(msg = "Loading data…") {
  const el = document.getElementById("app-loader");
  if (!el) return;
  const txt = el.querySelector(".loader-text");
  if (txt) txt.textContent = msg;
  el.hidden = false;
  document.body.classList.add("is-loading");
}
function hideLoader() {
  const el = document.getElementById("app-loader");
  if (!el) return;
  requestAnimationFrame(() => {
    el.hidden = true;
    document.body.classList.remove("is-loading");
    el.setAttribute("aria-busy", "false");
  });
}

/* =========================
   Data load + first render
========================= */
showLoader();

Promise.all([
  // parse at read time for speed
  d3.csv("data/sst_mean_map.csv", d => ({ lon:+d.lon, lat:+d.lat, value:+d.value })),
  d3.csv("data/ocean_timeseries.csv", d => ({ region:d.region, year:+d.year, temperature_K:+d.temperature_K })),
  d3.csv("data/calc_by_region.csv", d => ({ region:d.region, lev:+d.lev, time:+d.time, calc:+d.calc }))
]).then(([mapData, tsData, calcData]) => {
  drawMap(mapData, tsData, calcData);

  // After first paint, hide loader
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 0));
  idle(() => hideLoader());
}).catch(err => {
  console.error(err);
  const el = document.getElementById("app-loader");
  if (el) el.querySelector(".loader-text").textContent = "Failed to load data.";
});

/* =========================
   Map + legend + region click
========================= */
function drawMap(mapData, tsData, calcData) {
  d3.select("#map").selectAll("*").remove();

  const svg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 ${mapHeight * 0.04} ${mapWidth + 100} ${mapHeight * 0.96}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);

  // Projection
  const projection = d3.geoEquirectangular()
    .scale(mapWidth / (2 * Math.PI))
    .translate([mapWidth / 2, mapHeight / 2]);

  // Discrete color bins (5)
  const nBins = 5;
  const sortedVals = mapData.map(d => d.value).sort((a, b) => a - b);
  const quantiles = [0, 0.2, 0.4, 0.6, 0.8, 1].map(p => d3.quantileSorted(sortedVals, p));
  const thresholds = quantiles.slice(1, -1); // 4 thresholds -> 5 bins
  const colors = d3.schemeRdYlBu[nBins].slice().reverse(); // blue=cold → red=warm
  const colorScale = d3.scaleThreshold().domain(thresholds).range(colors);

  // Paint “pixels”
  const cellSize = 5;
  svg.selectAll("rect.cell")
    .data(mapData)
    .enter()
    .append("rect")
    .attr("class", "cell")
    .attr("x", d => projection([d.lon, d.lat])[0])
    .attr("y", d => projection([d.lon, d.lat])[1])
    .attr("width", cellSize)
    .attr("height", cellSize)
    .attr("fill", d => colorScale(d.value))
    .attr("stroke", "none");

  // Region hit areas
  const regions = [
    { name: "Atlantic", lon: [-80, 20],   lat: [-60, 60] },
    { name: "Pacific",  lon: [120, 180],  lat: [-60, 60] },
    { name: "Pacific",  lon: [-180, -80], lat: [-60, 60] },
    { name: "Indian",   lon: [20, 120],   lat: [-60, 30] },
    { name: "Arctic",   lon: [-180, 180], lat: [60, 90] },
    { name: "Southern", lon: [-180, 180], lat: [-90, -60] }
  ];

  const regionGroups = svg.selectAll(".region-group")
    .data(regions)
    .enter()
    .append("g")
    .attr("class", "region-group")
    .style("cursor", "pointer")
    .on("mouseover", function () {
      d3.select(this).select("rect").style("fill", "rgba(255,208,0,0.2)");
    })
    .on("mouseout", function () {
      d3.select(this).select("rect").style("fill", "transparent");
    })
    .on("click", (event, d) => {
      drawChart(tsData, d.name);
      drawCalcChart(calcData, d.name, 500);
      window.currentRegion = d.name;
      const target = document.getElementById("parent-chart"); // or "chart-panel" if you prefer
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - 8; // small offset
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });

  regionGroups.append("rect")
    .attr("x", d => projection([d.lon[0], d.lat[1]])[0])
    .attr("y", d => projection([d.lon[0], d.lat[1]])[1])
    .attr("width", d => projection([d.lon[1], 0])[0] - projection([d.lon[0], 0])[0])
    .attr("height", d => projection([0, d.lat[0]])[1] - projection([0, d.lat[1]])[1])
    .style("fill", "transparent");

  regionGroups.append("text")
    .attr("x", d => projection([(d.lon[0] + d.lon[1]) / 2, (d.lat[0] + d.lat[1]) / 2])[0])
    .attr("y", d => {
      const center = projection([(d.lon[0] + d.lon[1]) / 2, (d.lat[0] + d.lat[1]) / 2])[1];
      return center + (d.name === "Southern" ? 8 : 0);
    })
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", "18px")
    .attr("font-weight", "bold")
    .text(d => d.name);

  // Legend
  const legendWidth = 20;
  const legendHeight = 300;
  const binHeight = legendHeight / nBins;

  const legend = svg.append("g")
    .attr("transform", `translate(${mapWidth + 10},55)`);

  legend.selectAll("rect.step")
    .data(colors)
    .enter()
    .append("rect")
    .attr("class", "step")
    .attr("x", 0)
    .attr("y", (d, i) => legendHeight - (i + 1) * binHeight)
    .attr("width", legendWidth)
    .attr("height", binHeight)
    .attr("fill", d => d);

  // Numbers only (no tick lines)
  const edges = [quantiles[0], ...thresholds, quantiles[quantiles.length - 1]];
  const edgeIdx = d3.range(edges.length);
  const idxScale = d3.scaleLinear().domain([0, edges.length - 1]).range([legendHeight, 0]);

  const axisIdx = d3.axisRight(idxScale)
    .tickValues(edgeIdx)                       // all boundaries
    .tickFormat(i => d3.format(".1f")(edges[i]));

  const ax = legend.append("g")
    .attr("class", "legend-axis")
    .attr("transform", `translate(${legendWidth},0)`)
    .call(axisIdx);

  ax.select("path.domain").remove();
  ax.selectAll("line").remove();
  ax.selectAll("text")
    .attr("dx", "1px")
    .attr("fill", "#444")
    .style("font-size", "10px");

  // Legend label
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90, ${mapWidth + 95}, ${55 + legendHeight / 2})`)
    .attr("x", mapWidth + 95)
    .attr("y", 50 + legendHeight / 2)
    .attr("font-size", "14px")
    .text("Sea Surface Temperature (K)");
}

/* =========================
   SST line chart + slider
========================= */
function drawChart(tsData, region) {
  d3.select("#chart").selectAll("*").remove();

  const svg = d3.select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${chartHeight + 40}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);

  const regionData = tsData.filter(d => d.region === region);

  const x = d3.scaleLinear()
    .domain(d3.extent(regionData, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
    .domain([d3.min(regionData, d => d.temperature_K), d3.max(regionData, d => d.temperature_K)])
    .nice()
    .range([chartHeight - 40, TOP_PAD]);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.temperature_K));

  svg.append("path")
    .datum(regionData)
    .attr("fill", "none")
    .attr("stroke", "#d03838ff")
    .attr("stroke-width", 2)
    .attr("d", line);

  d3.select("#year-slider").selectAll("*").remove();
  d3.select("#slider-container")
    .text("Move the slider to see the mean sea surface temperature and calcite concentration for that year.")
    .style("font-size", "14px")
    .style("color", "#333")
    .style("margin-bottom", "16px")
    .style("text-align", "center");

  const slider = d3.select("#year-slider")
    .append("input")
    .attr("type", "range")
    .attr("class", "range")
    .attr("min", d3.min(regionData, d => d.year))
    .attr("max", d3.max(regionData, d => d.year))
    .attr("value", d3.min(regionData, d => d.year))
    .attr("step", 1)
    .style("width", "100%");

  const marker = svg.append("circle")
    .attr("cx", x(regionData[0].year))
    .attr("cy", y(regionData[0].temperature_K))
    .attr("r", 5)
    .attr("fill", "black");

  const firstYear = regionData[0].year;
  const firstTemp = regionData[0].temperature_K;

  d3.select("#slider-value")
    .html(`
      <div class="stats-row" role="group" aria-live="polite" aria-label="Selected year, temperature, and calcite concentration">
        <output id="outYear" class="pill stat"><span class="label">Year</span><span class="val tabnums">${firstYear}</span></output>
        <output id="outTemp" class="pill stat"><span class="label">Temp</span><span class="val tabnums">${fmtNum(firstTemp,2)}&nbsp;K</span></output>
        <output id="outCalc" class="pill stat"><span class="label">Calc</span><span class="val tabnums">—</span></output>
      </div>
    `)
    .style("font-size", "18px");

  slider.on("input", function () {
    const selectedYear = +this.value;
    const yearData = regionData.find(d => d.year === selectedYear);
    if (!yearData) return;

    marker
      .attr("cx", x(yearData.year))
      .attr("cy", y(yearData.temperature_K));

    const outYear = document.getElementById('outYear');
    const outTemp = document.getElementById('outTemp');
    const outCalc = document.getElementById('outCalc');
    if (outYear) outYear.querySelector('.val').textContent = `${yearData.year}`;
    if (outTemp) outTemp.querySelector('.val').textContent = `${yearData.temperature_K.toFixed(2)}\u00A0K`;

    if (outCalc) {
      const val = (typeof window.getCalcForYear === "function") ? window.getCalcForYear(selectedYear) : null;
      outCalc.querySelector('.val').innerHTML = (val == null) ? '—' : formatSci(val, 2) + '&nbsp;mol m<span class="sup">−3</span>';
    }

    if (window.updateCalcYear) window.updateCalcYear(selectedYear);
  });

  svg.append("g").attr("class", "x axis")
    .attr("transform", `translate(0,${chartHeight - 40})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg.append("g").attr("class", "y axis")
    .attr("transform", `translate(60,0)`)
    .call(d3.axisLeft(y));

  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "20px")
    .text(`A Century and a Half of Warmer Seas`);

  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 38)
    .attr("text-anchor", "middle")
    .attr("font-size", "14px")
    .attr("fill", "#6d6464ff")
    .text(`Simulated ${region} Ocean Mean Annual Sea Surface Temperature`);

  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", chartWidth / 2 + 5)
    .attr("y", chartHeight - 5)
    .attr("font-size", "14px")
    .text("Year");

  svg.append("text")
    .attr("class", "y-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", 15)
    .attr("font-size", "14px")
    .text("Sea Surface Temperature in Kelvin (K)");

  const yearFirst = 1850;
  const yearLast = 2014;
  const tempFirst = regionData.find(d => d.year === yearFirst)?.temperature_K;
  const tempLast = regionData.find(d => d.year === yearLast)?.temperature_K;
  const maxData = regionData.reduce((a, b) => a.temperature_K > b.temperature_K ? a : b);

  d3.select("#chart-annotation")
    .html(`
      <p>Global sea surface temperatures started rising rapidly after the middle of the 20th century, reflecting the impact of industrial growth and increased fossil fuel emissions.</p>
      <p>Since 1850, the ${region} Ocean's mean sea surface temperature changed by <strong>${formatDelta(tempLast - tempFirst, 2)} K</strong>, while reaching a peak of <strong>${maxData.temperature_K.toFixed(2)} K</strong> in ${maxData.year}.</p>
    `)
    .style("font-size", "14px")
    .style("color", "#333")
    .style("margin-top", "0.5rem");
}

/* =========================
   Calcite chart + level select
========================= */
function drawCalcChart(calcData, region, lev) {
  window.currentRegion = region;
  window.currentLev = lev;

  d3.select("#calc-chart").selectAll("*").remove();

  const panel = d3.select("#calc-panel");
  panel.select("#lev-select-container").remove();

  const selectContainer = panel.insert("div", ":first-child")
    .attr("id", "lev-select-container")
    .style("text-align", "center")
    .style("margin-bottom", "10px");

  selectContainer.append("label")
    .attr("for", "lev-select")
    .text("Ocean model level: ")
    .style("margin-right", "5px")
    .style("font-size", "15px");

  const select = selectContainer.append("select")
    .attr("id", "lev-select")
    .style("font-size", "14px");

  const levOptions = [
    500, 1500, 2500, 3500, 4500,
    5500, 6500, 7500, 8500, 9500,
    10500, 11500, 12500, 13500, 14500
  ];

  select.selectAll("option")
    .data(levOptions)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d)
    .property("selected", d => d === lev);

  select.on("change", function () {
    const newLev = +this.value;
    drawCalcChart(calcData, region, newLev);
  });

  const rows = calcData
    .filter(d => d.region === region && +d.lev === +lev)
    .map(d => ({ year: +d.time, calc: +d.calc }))
    .sort((a, b) => a.year - b.year);

  if (!rows.length) return;

  // Expose calc lookup for SST slider
  window.getCalcForYear = function (year) {
    const match = rows.find(r => r.year === year);
    return match ? match.calc : null;
  };

  const svg = d3.select("#calc-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${chartHeight + 40}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);

  const x = d3.scaleLinear()
    .domain(d3.extent(rows, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(rows, d => d.calc)).nice()
    .range([chartHeight - 40, TOP_PAD]);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.calc));

  // Start at current slider year if available
  const sliderInput = d3.select("#year-slider input").node();
  let currentYear = rows[0].year;
  if (sliderInput) {
    const sliderYear = +sliderInput.value;
    if (rows.find(r => r.year === sliderYear)) currentYear = sliderYear;
  }

  svg.append("path")
    .datum(rows)
    .attr("fill", "none")
    .attr("stroke", "#3366cc")
    .attr("stroke-width", 2)
    .attr("d", line);

  const currentRow = rows.find(r => r.year === currentYear) || rows[0];

  const marker = svg.append("circle")
    .attr("cx", x(currentRow.year))
    .attr("cy", y(currentRow.calc))
    .attr("r", 5)
    .attr("fill", "black");

  svg.append("g").attr("class", "x axis")
    .attr("transform", `translate(0,${chartHeight - 40})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg.append("g").attr("class", "y axis")
    .attr("transform", `translate(60,0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toExponential(1)));

  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "20px")
    .text(`The Sea's Barrier is Weakening`);

  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 38)
    .attr("text-anchor", "middle")
    .attr("font-size", "14px")
    .attr("fill", "#555")
    .text(`Simulated ${region} Ocean Calcite Concentration at Level ${lev} (${Math.round(lev/100)} m)`);

  svg.append("text")
    .attr("class", "y-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", 10)
    .attr("font-size", "14px")
    .text("Calcite concentration (mol m-3)");

  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight - 5)
    .attr("font-size", "14px")
    .text("Year");

  // Annotation
  const yearFirst = 1850, yearLast = 2014;
  const calcFirst = rows.find(r => r.year === yearFirst)?.calc;
  const calcLast = rows.find(r => r.year === yearLast)?.calc;
  const minRow = rows.reduce((a, b) => (a.calc < b.calc ? a : b));

  d3.select("#calc-annotation")
    .html(`
      <p>Calcite concentration, a major indicator of the ocean's ability to neutralize acidity, has changed unevenly since industrialization. In places where it has declined, this change has left coral ecosystems and countless marine species more vulnerable to environmental degradation.</p>
      <p>Since ${yearFirst}, the ${region} Ocean's calcite concentration at level ${lev} (${Math.round(lev/100)} m) changed by <strong>${formatSciDelta(calcLast - calcFirst, 2)} mol m<sup>−3</sup></strong>. Calcite concentration reached a low of <strong>${formatSci(minRow.calc, 2)} mol m<sup>−3</sup></strong> in ${minRow.year}.</p>
    `)
    .style("font-size", "14px")
    .style("color", "#333")
    .style("margin-top", "0.5rem");

  // Expose year updates from SST slider
  window.updateCalcYear = function (selectedYear) {
    const match = rows.find(r => r.year === selectedYear);
    if (!match) return;
    marker.attr("cx", x(match.year)).attr("cy", y(match.calc));
  };

  // Refresh the Calc pill to current year
  const outCalc = document.getElementById('outCalc');
  let yr = null;
  const outYearEl = document.getElementById('outYear');
  if (outYearEl) {
    const t = outYearEl.querySelector('.val')?.textContent;
    yr = t ? +t : null;
  }
  if (yr == null) {
    const sliderInput2 = document.querySelector('#year-slider input[type="range"]');
    if (sliderInput2) yr = +sliderInput2.value;
  }
  if (yr == null) yr = currentYear;
  if (outCalc) {
    const calcVal = window.getCalcForYear(yr);
    outCalc.querySelector('.val').innerHTML = (calcVal == null) ? '—'
      : formatSci(calcVal, 2) + '&nbsp;mol m<span class="sup">−3</span>';
  }
}
