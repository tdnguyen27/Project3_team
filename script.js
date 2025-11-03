// Basic dimensions
const mapWidth = 800;
const mapHeight = 400;
const chartWidth = 800;
const chartHeight = 400;

// Load data and draw map
Promise.all([
  d3.csv("data/sst_mean_map.csv"),
  d3.csv("data/ocean_timeseries.csv")
]).then(([mapData, tsData]) => {
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

  drawMap(mapData, tsData);
});

function drawMap(mapData, tsData) {
  d3.select("#map").selectAll("*").remove(); // clear previous map
  const svg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth + 100} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true);


    
  // Projection
  const projection = d3.geoEquirectangular()
    .scale(mapWidth / (2 * Math.PI))
    .translate([mapWidth / 2, mapHeight / 2]);

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
  .on("click", (event, d) => drawChart(tsData, d.name));

// Append rectangle to each group
regionGroups.append("rect")
  .attr("x", d => projection([d.lon[0], d.lat[1]])[0])
  .attr("y", d => projection([d.lon[0], d.lat[1]])[1])
  .attr("width", d => projection([d.lon[1], 0])[0] - projection([d.lon[0], 0])[0])
  .attr("height", d => projection([0, d.lat[0]])[1] - projection([0, d.lat[1]])[1])
  .style("fill", "transparent");

// Append label to each group
regionGroups.append("text")
  .attr("x", d => projection([(d.lon[0]+d.lon[1])/2, (d.lat[0]+d.lat[1])/2])[0])
  .attr("y", d => projection([(d.lon[0]+d.lon[1])/2, (d.lat[0]+d.lat[1])/2])[1])
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
  .attr("transform", `translate(${mapWidth + 10},50)`);

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
  .attr("transform", `rotate(-90, ${mapWidth + 70}, ${50 + legendHeight/2})`)
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

  // Split data into pre- and post-industrial
  const preIndustrial = regionData.filter(d => d.year <= 1901);
  const postIndustrial = regionData.filter(d => d.year >= 1901);

  // Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(regionData, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
  .domain([d3.min(regionData, d => d.temperature_K), d3.max(regionData, d => d.temperature_K) + 0.3]) // add extra 1 K at top
  .nice()
  .range([chartHeight - 40, 20]); // keep same pixel range


  // Line generator
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.temperature_K));

  // Draw pre-industrial line
  svg.append("path")
    .datum(preIndustrial)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", line);

  // Draw post-industrial line
  svg.append("path")
    .datum(postIndustrial)
    .attr("fill", "none")
    .attr("stroke", "firebrick")
    .attr("stroke-width", 2)
    .attr("d", line);

  d3.select("#year-slider").selectAll("*").remove();
  const container = d3.select("#slider-container")
  .text("Move the slider to see the mean sea surface temperature for that year.")
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

  // Display value text
  const valueText = d3.select("#slider-value")
  .text(`Year: ${regionData[0].year}, Temp: ${regionData[0].temperature_K.toFixed(2)} K`)
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

  // Update value text
  valueText.text(`Year: ${yearData.year}, Temp: ${yearData.temperature_K.toFixed(2)} K`);
  
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

  // Legend
  const legend = svg.append("g").attr("transform", `translate(${chartWidth - 200}, 35)`);
  
  legend.append("rect")
  .attr("x", -5)       // small padding
  .attr("y", -5)
  .attr("width", 190)  // width enough to fit text and color boxes
  .attr("height", 45)  // height enough for two entries + padding
  .attr("fill", "transparent") // light background color
  .attr("stroke", "#999")   // optional border
  .attr("rx", 5)            // rounded corners
  .attr("ry", 5);

  legend.append("rect").attr("x",0).attr("y",0).attr("width",15).attr("height",15).attr("fill","steelblue");
  legend.append("text").attr("x",20).attr("y",12).text("Pre-Industrial (1850–1900)").attr("font-size", "13px");

  legend.append("rect").attr("x",0).attr("y",20).attr("width",15).attr("height",15).attr("fill","firebrick");
  legend.append("text").attr("x",20).attr("y",32).text("Post-Industrial (1901–2014)").attr("font-size", "13px");

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
    .text("Sea Surface Temperature (K)");
    // --- Annotation: temperature change between 1850 and 2014 ---
  const yearStart = 1901;
  const yearEnd = 2014;

  const tempStart = regionData.find(d => d.year === yearStart)?.temperature_K;
  const tempEnd = regionData.find(d => d.year === yearEnd)?.temperature_K;

  if (tempStart && tempEnd) {
    const diff = tempEnd - tempStart;

    // Add annotation text
    svg.append("text")
      .attr("transform", `translate(${chartWidth/2}, ${chartHeight+10})`)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "gray")
      .text(`Since the industrial era started in 1901 the ${region} Ocean's mean sea surface temperature has changed by ${diff.toFixed(2)} K`);
  
  const yearFirst = 1850;
  const yearLast = 2014;
  const tempFirst = regionData.find(d => d.year === yearFirst)?.temperature_K;
  const tempLast = regionData.find(d => d.year === yearLast)?.temperature_K;

  if (tempFirst && tempLast) {
    const dif = tempLast - tempFirst;

    // Add annotation text
    svg.append("text")
      .attr("transform", `translate(${chartWidth/2}, ${chartHeight+25})`)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "gray")
      .text(`Since 1850 the ${region} Ocean's mean sea surface temperature has changed by ${dif.toFixed(2)} K`);
  
    }
  }
}
