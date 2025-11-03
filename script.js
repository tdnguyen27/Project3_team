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
    .attr("width", mapWidth + 100)  // extra space for legend
    .attr("height", mapHeight);

    
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

svg.selectAll(".region")
  .data(regions)
  .enter()
  .append("rect")
  .attr("class", "region")
  .attr("x", d => projection([d.lon[0], d.lat[1]])[0])
  .attr("y", d => projection([d.lon[0], d.lat[1]])[1])
  .attr("width", d => projection([d.lon[1], 0])[0] - projection([d.lon[0], 0])[0])
  .attr("height", d => projection([0, d.lat[0]])[1] - projection([0, d.lat[1]])[1])
  .style("fill", "transparent")
  .style("cursor", "pointer")
  .on("mouseover", function() { d3.select(this).style("fill", "rgba(255,255,0,0.2)"); })
  .on("mouseout", function() { d3.select(this).style("fill", "transparent"); })
  .on("click", (event, d) => drawChart(tsData, d.name));

// Labels
svg.selectAll(".region-label")
  .data(regions)
  .enter()
  .append("text")
  .attr("x", d => projection([(d.lon[0]+d.lon[1])/2, (d.lat[0]+d.lat[1])/2])[0])
  .attr("y", d => projection([(d.lon[0]+d.lon[1])/2, (d.lat[0]+d.lat[1])/2])[1])
  .attr("text-anchor", "middle")
  .attr("dy", "0.35em")
  .text(d => d.name);

  
  const legendHeight = 200, legendWidth = 20;
  const legendScale = d3.scaleLinear()
      .domain([minVal, maxVal])
      .range([legendHeight, 0]);

  const legendAxis = d3.axisRight(legendScale)
      .ticks(5);

  const legend = svg.append("g")
      .attr("transform", `translate(${mapWidth + 10},50)`);

  legend.selectAll("rect")
      .data(d3.range(legendHeight))
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", d => d)
      .attr("width", legendWidth)
      .attr("height", 1)
      .attr("fill", d => colorScale(minVal + (maxVal-minVal)*(legendHeight-d)/legendHeight));

  legend.append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(legendAxis);
}

function drawChart(tsData, region) {
  d3.select("#chart").selectAll("*").remove();

  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", chartWidth)
    .attr("height", chartHeight);

  const regionData = tsData.filter(d => d.region === region);

  // Split data into pre- and post-industrial
  const preIndustrial = regionData.filter(d => d.year <= 1900);
  const postIndustrial = regionData.filter(d => d.year >= 1901);

  // Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(regionData, d => d.year))
    .range([60, chartWidth - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(regionData, d => d.temperature_K))
    .nice()
    .range([chartHeight - 40, 20]);

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
  const legend = svg.append("g")
    .attr("transform", `translate(${chartWidth - 275},30)`);

  legend.append("rect").attr("x",0).attr("y",0).attr("width",15).attr("height",15).attr("fill","steelblue");
  legend.append("text").attr("x",20).attr("y",12).text("Pre-Industrial (1850–1900)");

  legend.append("rect").attr("x",0).attr("y",20).attr("width",15).attr("height",15).attr("fill","firebrick");
  legend.append("text").attr("x",20).attr("y",32).text("Post-Industrial (1901–2014)");
}
