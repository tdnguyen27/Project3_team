// Basic dimensions
const mapWidth = 800;
const mapHeight = 400;
const chartWidth = 800;
const chartHeight = 400;

// Load data and draw map
Promise.all([
  d3.csv("data/sst_mean_map.csv"),
  d3.csv("data/ocean_timeseries.csv"),
  d3.csv("data/calc_by_region.csv")                         // 🔴 NEW
]).then(([mapData, tsData, calcData]) => {                  // 🔴 NEW
  // Convert numeric values
  mapData.forEach(d => {
    d.lon = +d.lon;
    d.lat = +d.lat;
    d.value = +d.value;
  });
  tsData.forEach(d => {
    d.temperature_K = +d.temperature_K;
    d.year = +d.year;
  });

  drawMap(mapData, tsData, calcData);                       // 🔴 NEW

  // 🔴 hook up the dropdown so changing it redraws the calc chart
  const levSelect = d3.select("#lev-select");
  levSelect.on("change", function () {
    const newLev = +this.value;
    // only redraw if we already clicked a region
    if (window.currentRegion) {
      drawCalcChart(calcData, window.currentRegion, newLev);
    }
  });
});

function drawMap(mapData, tsData, calcData) {
  d3.select("#map").selectAll("*").remove(); // clear previous map
  const svg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 ${mapHeight * 0.04} ${mapWidth + 100} ${mapHeight * 0.96}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);

  // Projection
  const projection = d3.geoEquirectangular()
    .scale(mapWidth / (2 * Math.PI))
    .translate([mapWidth / 2, mapHeight / 2])

  mapData.forEach(d => d.value = +d.value);

  const minVal = d3.min(mapData, d => d.value);
  const maxVal = d3.max(mapData, d => d.value);

  const colorScale = d3.scaleSequential()
    .domain([maxVal, minVal])          // reversed to match Python coolwarm
    .interpolator(d3.interpolateRdBu);
  
  // Draw rectangles as pseudo-pixels
  const cellSize = 5;
  svg.selectAll("rect")
    .data(mapData)
    .enter()
    .append("rect")
    .attr("x", d => projection([d.lon, d.lat])[0])
    .attr("y", d => projection([d.lon, d.lat])[1])
    .attr("width", cellSize)
    .attr("height", cellSize)
    .attr("fill", d => colorScale(d.value))
    .attr("stroke", "none");

  // Define rough bounding boxes for oceans
  const regions = [
    { name: "Atlantic", lon: [-80, 20], lat: [-60, 60] },
    { name: "Pacific", lon: [120, 180], lat: [-60, 60] }, // wrap-around handled
    { name: "Pacific", lon: [-180, -80], lat: [-60, 60] },
    { name: "Indian", lon: [20, 120], lat: [-60, 30] },
    { name: "Arctic", lon: [-180, 180], lat: [60, 90] },
    { name: "Southern", lon: [-180, 180], lat: [-90, -60] }
];

// Create a group for each region (rect + label)
const regionGroups = svg.selectAll(".region-group")
  .data(regions)
  .enter()
  .append("g")
  .attr("class", "region-group")
  .style("cursor", "pointer")
  .on("mouseover", function(event, d) {
    d3.select(this).select("rect").style("fill", "rgba(255,255,0,0.2)");
    d3.select(this).select("text").style("fill", "orange"); // optional highlight
  })
  .on("mouseout", function(event, d) {
    d3.select(this).select("rect").style("fill", "transparent");
    d3.select(this).select("text").style("fill", "black"); // reset label color
  })
  .on("click", (event, d) => {
    drawChart(tsData, d.name);                 // existing SST chart
    drawCalcChart(calcData, d.name, 500);      // 🔴 NEW calc w/lev = 500
  });     

// Append rectangle to each group
regionGroups.append("rect")
  .attr("x", d => projection([d.lon[0], d.lat[1]])[0])
  .attr("y", d => projection([d.lon[0], d.lat[1]])[1])
  .attr("width", d => projection([d.lon[1], 0])[0] - projection([d.lon[0], 0])[0])
  .attr("height", d => projection([0, d.lat[0]])[1] - projection([0, d.lat[1]])[1])
  .style("fill", "transparent");

// Append label to each group
regionGroups.append("text")
  .attr("x", d => projection([(d.lon[0]+d.lon[1])/2 + 5, (d.lat[0]+d.lat[1])/2])[0] + 5)
  .attr("y", d => projection([(d.lon[0]+d.lon[1])/2 + 5, (d.lat[0]+d.lat[1])/2])[1] +5 )
  .attr("text-anchor", "middle")
  .attr("dy", "0.35em")
  .attr("font-size", "18px")
  .attr("font-weight", "bold")
  .text(d => d.name);
  
// Legend dimensions
const legendWidth = 20;
const legendHeight = 300;

// Append defs for gradient
const defs = svg.append("defs");

const gradient = defs.append("linearGradient")
    .attr("id", "legend-gradient")
    .attr("x1", "0%").attr("y1", "100%")
    .attr("x2", "0%").attr("y2", "0%");

// Create stops
const nStops = 10; // 10 stops is enough
d3.range(nStops + 1).forEach(i => {
  const t = i / nStops;
  gradient.append("stop")
    .attr("offset", `${t*100}%`)
    .attr("stop-color", colorScale(minVal + t*(maxVal-minVal)));
});

// Draw rectangle using gradient
const legend = svg.append("g")
  .attr("transform", `translate(${mapWidth + 10},55)`);

legend.append("rect")
  .attr("width", legendWidth)
  .attr("height", legendHeight)
  .style("fill", "url(#legend-gradient)");

// Axis
const legendScale = d3.scaleLinear()
    .domain([minVal, maxVal])
    .range([legendHeight, 0]);

const legendAxis = d3.axisRight(legendScale).ticks(5);

legend.append("g")
  .attr("transform", `translate(${legendWidth},0)`)
  .call(legendAxis);

// Axis label
svg.append("text")
  .attr("text-anchor", "middle")
  .attr("transform", `rotate(-90, ${mapWidth + 70}, ${55 + legendHeight/2})`)
  .attr("x", mapWidth + 70)
  .attr("y", 50 + legendHeight/2)
  .attr("font-size", "12px")
  .text("Sea Surface Temperature (K)");

}

function drawChart(tsData, region) {
  d3.select("#chart").selectAll("*").remove();

  const svg = d3.select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight + 40}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);


  const regionData = tsData.filter(d => d.region === region);

  // Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(regionData, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
  .domain([d3.min(regionData, d => d.temperature_K), d3.max(regionData, d => d.temperature_K)]) // add extra 1 K at top
  .nice()
  .range([chartHeight - 40, 20]); // keep same pixel range


  // Line generator
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
  const container = d3.select("#slider-container")
  .text("Move the slider to see the mean sea surface temperature and calcite concentration for that year.")
  .style("font-size", "16px")
  .style("color", "#333")
  .style("margin-bottom", "5px")
  .style("text-align", "center");

  // Create slider
  const slider = d3.select("#year-slider")
  .append("input")
  .attr("type", "range")
  .attr("min", d3.min(regionData, d => d.year))
  .attr("max", d3.max(regionData, d => d.year))
  .attr("value", d3.min(regionData, d => d.year))
  .attr("step", 1)
  .style("width", "100%");

  // Circle marker for current year
  const marker = svg.append("circle")
  .attr("cx", x(regionData[0].year))
  .attr("cy", y(regionData[0].temperature_K))
  .attr("r", 5)
  .attr("fill", "black");

  const firstYear = regionData[0].year;
  const firstTemp = regionData[0].temperature_K;
  let firstCalcText = "";
  if (typeof window.getCalcForYear === "function") {
    const firstCalc = window.getCalcForYear(firstYear);
    if (firstCalc !== null && firstCalc !== undefined) {
      firstCalcText = `, Calc: ${firstCalc.toExponential(3)} mol m-3`;
    }
  }

  const valueText = d3.select("#slider-value")
  .text(`Year: ${firstYear}, Temp: ${firstTemp.toFixed(2)} K${firstCalcText}`)
  .style("font-size", "18px");

  // Update function
  slider.on("input", function() {
  const selectedYear = +this.value;
  const yearData = regionData.find(d => d.year === selectedYear);
  if (!yearData) return;

  // Move marker
  marker
    .attr("cx", x(yearData.year))
    .attr("cy", y(yearData.temperature_K));

  // try to get matching calc value (if calc chart has been drawn)
  let calcText = "";
  if (typeof window.getCalcForYear === "function") {
    const calcVal = window.getCalcForYear(selectedYear);
    if (calcVal !== null && calcVal !== undefined) {
      // format however you like
      calcText = `, Calc: ${calcVal.toExponential(2)} mol m-3`;
    }
  }
  // Update value text
  valueText.text(
    `Year: ${yearData.year}, Temp: ${yearData.temperature_K.toFixed(2)} K${calcText}`);

  // 🔴 NEW: tell calc chart as well 
  if (window.updateCalcYear) {
    window.updateCalcYear(selectedYear);
  }
  });

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${chartHeight - 40})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg.append("g")
    .attr("transform", `translate(60,0)`)
    .call(d3.axisLeft(y));

  // Title
  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .text(`${region} Ocean Mean Annual Sea Surface Temperature`);

    // X-axis label
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight - 5)
    .attr("font-size", "12px")
    .text("Year");

  // Y-axis label
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", 20)
    .attr("font-size", "12px")
    .text("Sea Surface Temperature in Kelvin (K)");

  // --- Annotation: temperature change between 1850 and 2014 ---
  const yearFirst = 1850;
  const yearLast = 2014;
  const tempFirst = regionData.find(d => d.year === yearFirst)?.temperature_K;
  const tempLast = regionData.find(d => d.year === yearLast)?.temperature_K;

  if (tempFirst && tempLast) {
    const dif = tempLast - tempFirst;

    // Add annotation text
    svg.append("text")
      .attr("transform", `translate(${chartWidth/2}, ${chartHeight+10})`)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "gray")
      .text(`Since 1850 the ${region} Ocean's mean sea surface temperature has changed by ${dif.toFixed(2)} K`);
  
    
  }
  const maxData = regionData.reduce((a, b) => a.temperature_K > b.temperature_K ? a : b);
  svg.append("text")
      .attr("transform", `translate(${chartWidth/2}, ${chartHeight+25})`)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "gray")
      .text(`Mean sea surface temperature for the ${region} Ocean reached an all time high of ${maxData.temperature_K.toFixed(2)} K in ${maxData.year}`);
}

function drawCalcChart(calcData, region, lev) {
  // remember current selection for dropdown redraws
  window.currentRegion = region;
  window.currentLev = lev;

  // clear the calc container
  d3.select("#calc-chart").selectAll("*").remove();

  // 1) clear previous controls
  const panel = d3.select("#calc-panel");
  panel.selectAll("label").remove();
  panel.selectAll("select").remove();

  // 2) create label + select dynamically
  const label = panel.append("label")
    .attr("for", "lev-select")
    .text("Ocean model level: ")
    .style("display", "inline-block")  // ensures spacing applies properly
    .style("margin-top", "10px")
    .style("margin-right", "5px")
    .style("margin-left", "10px");     // little space between label and dropdown

  const select = panel.append("select")
    .attr("id", "lev-select")
    .style("margin-top", "10px")       // add top padding between chart and dropdown
    .style("margin-bottom", "10px")    // add extra gap before next content
    .style("font-size", "14px");

  const levOptions = [500, 1500, 2500, 3500, 4500, 
    5500, 6500, 7500, 8500, 9500, 
    10500, 11500, 12500, 13500, 14500];

  select.selectAll("option")
    .data(levOptions)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d)
    .property("selected", d => d === lev);

  // when user changes lev, redraw
  select.on("change", function() {
    const newLev = +this.value;
    drawCalcChart(calcData, region, newLev);
  });

  // filter rows for this region AND this lev
  const rows = calcData
    .filter(d => d.region === region && +d.lev === +lev)
    .map(d => ({
      year: +d.time,
      calc: +d.calc
    }))
    .sort((a, b) => a.year - b.year);  // just to be safe

  // guard: if no data, stop
  if (!rows.length) return;

  // 🔴 NEW expose a helper so the SST slider can ask for the calc at a given year
  window.getCalcForYear = function(year) {
    const match = rows.find(r => r.year === year);
    return match ? match.calc : null;
  };

  const svg = d3.select("#calc-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight + 40}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);

  // scales
  const x = d3.scaleLinear()
    .domain(d3.extent(rows, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(rows, d => d.calc))
    .nice()
    .range([chartHeight - 40, 20]);

  // line
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.calc));

  // get current slider year if it exists
  const sliderInput = d3.select("#year-slider input").node();
  let currentYear = rows[0].year;  // fallback

  if (sliderInput) {
    const sliderYear = +sliderInput.value;
    const match = rows.find(r => r.year === sliderYear);
    if (match) {
      currentYear = sliderYear;
    }
  }

  svg.append("path")
    .datum(rows)
    .attr("fill", "none")
    .attr("stroke", "#3366cc")
    .attr("stroke-width", 2)
    .attr("d", line);

  // pick the row that matches the current year (we set above)
  const currentRow = rows.find(r => r.year === currentYear) || rows[0];

  const marker = svg.append("circle")
    .attr("cx", x(currentRow.year))
    .attr("cy", y(currentRow.calc))
    .attr("r", 5)
    .attr("fill", "black");

  // axes
  svg.append("g")
    .attr("transform", `translate(0,${chartHeight - 40})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg.append("g")
    .attr("transform", `translate(60,0)`)
    .call(
      d3.axisLeft(y)
      .ticks(6)
      .tickFormat(d => d.toExponential(1))
    );

  // labels
  svg.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .text(`${region} Ocean Calcite Concentration at Level ${lev}`);

  // y axis formatting
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", 13)
    .attr("font-size", "12px")
    .text("Calcite concentration (mol m-3)");

  // x axis formatting
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight - 5)
    .attr("font-size", "12px")
    .text("Year");

  // --- Annotation: calcite change between first and last year ---
  const yearFirst = 1850; 
  const yearLast  = 2014;  
  const calcFirst = rows.find(r => r.year === yearFirst)?.calc;
  const calcLast  = rows.find(r => r.year === yearLast)?.calc;

  if (calcFirst !== undefined && calcLast !== undefined) {
    const dif = calcLast - calcFirst;

    svg.append("text")
      .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + 10})`)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "gray")
      .text(
        `Since ${yearFirst} the ${region} Ocean's calcite concentration at level ${lev} has changed by ${dif.toExponential(2)} mol m-3`
      );
  }
  // max calc for this region+lev
  const maxRow = rows.reduce((a, b) => (a.calc < b.calc ? a : b));
  svg.append("text")
    .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + 25})`)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "gray")
    .text(
      `Calcite concentration for the ${region} Ocean reached a low of ${maxRow.calc.toExponential(2)} mol m-3 in ${maxRow.year}`
    );

  // 🔴 this is what the SST slider will call
  window.updateCalcYear = function(selectedYear) {
    const match = rows.find(r => r.year === selectedYear);
    if (!match) return;
    marker
      .attr("cx", x(match.year))
      .attr("cy", y(match.calc));
  };

  // also update the slider text if it exists
  const sliderTextSel = d3.select("#slider-value");
  const currentText = sliderTextSel.text(); // e.g. "Year: 1890, Temp: 18.69 K"

  // try to pull out year and temp from the existing text
  const m = currentText.match(/Year:\s*(\d{4}).*?Temp:\s*([\d.]+)\s*K/);
  if (m) {
    const yr = +m[1];
    const tempK = +m[2];
    const calcVal = window.getCalcForYear(yr);

    let newText = `Year: ${yr}, Temp: ${tempK.toFixed(2)} K`;
    if (calcVal !== null && calcVal !== undefined) {
      newText += `, Calc: ${calcVal.toExponential(2)} mol m-3`;
    }
    sliderTextSel.text(newText);
  }
}

