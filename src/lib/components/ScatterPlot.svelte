<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import { scatterPlotData, selectedInvestorType, selectedYear, dataScales } from '$lib/stores.js';
  
  // DOM elements
  let chartContainer;
  let chart;
  let width;
  let height;
  let margin = { top: 40, right: 30, bottom: 50, left: 60 };
  
  // Store subscriptions
  let data;
  let investorType;
  let year;
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  
  const unsubscribeData = scatterPlotData.subscribe(value => {
    data = value;
    if (chart) updateChart();
  });
  
  const unsubscribeInvestorType = selectedInvestorType.subscribe(value => {
    investorType = value;
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
  });
  
  const unsubscribeDataScales = dataScales.subscribe(value => {
    scales = value;
    if (chart) updateChart();
  });
  
  // Set investor type
  function setInvestorType(type) {
    selectedInvestorType.set(type);
  }
  
  // Initialize chart on mount
  onMount(() => {
    console.log("ScatterPlot component mounted");
    initializeChart();
    
    // Cleanup on component destroy
    return () => {
      unsubscribeData();
      unsubscribeInvestorType();
      unsubscribeYear();
      unsubscribeDataScales();
      if (chart) chart.selectAll('*').remove();
    };
  });
  
  // Update chart dimensions on resize
  afterUpdate(() => {
    if (chartContainer && chart) {
      const newWidth = chartContainer.clientWidth;
      const newHeight = chartContainer.clientHeight;
      
      if (newWidth !== width || newHeight !== height) {
        width = newWidth;
        height = newHeight;
        updateChart();
      }
    }
  });
  
  // Initialize the D3 chart
  function initializeChart() {
    if (!chartContainer) return;
    
    console.log("Initializing scatter plot chart");
    
    // Get dimensions
    width = chartContainer.clientWidth;
    height = chartContainer.clientHeight;
    
    // Create SVG
    chart = d3.select(chartContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add chart elements
    chart.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height - margin.top - margin.bottom})`);
    
    chart.append('g')
      .attr('class', 'y-axis');
    
    chart.append('text')
      .attr('class', 'x-label')
      .attr('text-anchor', 'middle')
      .attr('x', (width - margin.left - margin.right) / 2)
      .attr('y', height - margin.top)
      .style('font-size', '12px')
      .style('fill', '#000');
    
    chart.append('text')
      .attr('class', 'y-label')
      .attr('text-anchor', 'middle')
      .attr('transform', `rotate(-90)`)
      .attr('x', -(height - margin.top - margin.bottom) / 2)
      .attr('y', -margin.left + 15)
      .style('font-size', '12px')
      .style('fill', '#000');
    
    chart.append('line')
      .attr('class', 'boston-avg-x')
      .style('stroke', '#999')
      .style('stroke-dasharray', '4,4');
    
    chart.append('line')
      .attr('class', 'boston-avg-y')
      .style('stroke', '#999')
      .style('stroke-dasharray', '4,4');
    
    chart.append('g')
      .attr('class', 'points');
    
    chart.append('g')
      .attr('class', 'selected-points');
    
    chart.append('text')
      .attr('class', 'boston-avg-label')
      .attr('text-anchor', 'start')
      .style('font-size', '10px')
      .style('fill', '#000');
    
    // Add tooltip
    d3.select(chartContainer)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);
    
    updateChart();
  }
  
  // Update the chart with new data
  function updateChart() {
    if (!chart || !data || !data.allPoints || !data.allPoints.length) {
      console.log("Cannot update chart - missing data or chart not ready");
      return;
    }
    
    console.log("Updating scatter plot with data points:", data.allPoints.length);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create scales using global max values for consistency across investor types
    const xScale = d3.scaleLinear()
      .domain([0, data.maxX || scales.maxInvestorCount || 1])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([0, data.maxY || scales.maxEvictionRate || 0.5])
      .range([innerHeight, 0]);
    
    // Update axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5);
    
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);
    
    chart.select('.x-axis')
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#000');
    
    chart.select('.y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#000');
    
    // Update labels
    chart.select('.x-label')
      .text(`${investorType.charAt(0).toUpperCase() + investorType.slice(1)} Investor Count`);
    
    chart.select('.y-label')
      .text(`${year} Eviction Rate`);
    
    // Update Boston average lines
    const avgX = data.bostonAverage.x;
    const avgY = data.bostonAverage.y;
    
    chart.select('.boston-avg-x')
      .attr('x1', 0)
      .attr('y1', yScale(avgY))
      .attr('x2', innerWidth)
      .attr('y2', yScale(avgY));
    
    chart.select('.boston-avg-y')
      .attr('x1', xScale(avgX))
      .attr('y1', 0)
      .attr('x2', xScale(avgX))
      .attr('y2', innerHeight);
    
    chart.select('.boston-avg-label')
      .attr('x', xScale(avgX) + 5)
      .attr('y', yScale(avgY) - 5)
      .text(`Boston Average (${avgX.toFixed(1)} investors, ${(avgY * 100).toFixed(1)}%)`);
    
    // Update points
    const points = chart.select('.points')
      .selectAll('circle')
      .data(data.allPoints.filter(d => !d.selected));
    
    points.exit().remove();
    
    points.enter()
      .append('circle')
      .merge(points)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5)
      .style('fill', '#aaa')
      .style('opacity', 0.6)
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(200)
          .attr('r', 7)
          .style('opacity', 0.8);
          
        const tooltip = d3.select('.tooltip');
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);
        tooltip.html(`
          <strong>Census Tract:</strong> ${d.tract_id}<br>
          <strong>${investorType} Investors:</strong> ${d.x}<br>
          <strong>Eviction Rate:</strong> ${(d.y * 100).toFixed(1)}%
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).transition()
          .duration(500)
          .attr('r', 5)
          .style('opacity', 0.6);
          
        d3.select('.tooltip').transition()
          .duration(500)
          .style('opacity', 0);
      });
    
    // Update selected points
    const selectedPoints = chart.select('.selected-points')
      .selectAll('circle')
      .data(data.allPoints.filter(d => d.selected));
    
    selectedPoints.exit().remove();
    
    selectedPoints.enter()
      .append('circle')
      .merge(selectedPoints)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 8)
      .style('fill', '#EEB0C2')
      .style('stroke', '#000')
      .style('stroke-width', 1)
      .style('opacity', 1) // Increase opacity to make points fully visible
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(200)
          .attr('r', 10);
          
        const tooltip = d3.select('.tooltip');
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);
        tooltip.html(`
          <strong>Census Tract:</strong> ${d.tract_id}<br>
          <strong>${investorType} Investors:</strong> ${d.x}<br>
          <strong>Eviction Rate:</strong> ${(d.y * 100).toFixed(1)}%
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).transition()
          .duration(500)
          .attr('r', 8);
          
        d3.select('.tooltip').transition()
          .duration(500)
          .style('opacity', 0);
      });
  }
</script>

<div class="chart-container">
  <div bind:this={chartContainer} class="chart"></div>
  <div class="chart-controls">
    <button 
      class:active={investorType === 'institutional'} 
      on:click={() => setInvestorType('institutional')}>
      Institutional Investors
    </button>
    <button 
      class:active={investorType === 'large'} 
      on:click={() => setInvestorType('large')}>
      Large Investors
    </button>
    <button 
      class:active={investorType === 'medium'} 
      on:click={() => setInvestorType('medium')}>
      Medium Investors
    </button>
    <button 
      class:active={investorType === 'small'} 
      on:click={() => setInvestorType('small')}>
      Small Investors
    </button>
  </div>
  <div class="chart-explanation">
    <p>This scatter plot shows the relationship between {investorType} investor counts and eviction rates in census tracts. Selected tracts are highlighted in pink. The dashed lines show the Boston average.</p>
  </div>
</div>

<style>
  .chart-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    opacity: 1;
    transform: translateY(0);
  }
  
  .chart {
    width: 100%;
    height: 400px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem;
    position: relative;
  }
  
  .chart-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
    color: #000;
    font-family: 'Roboto', sans-serif;
  }
  
  button:hover {
    background-color: #f5f5f5;
  }
  
  button.active {
    background-color: #EEB0C2;
    color: black;
    border-color: #EEB0C2;
  }
  
  .chart-explanation {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #000;
    font-family: 'Roboto', sans-serif;
  }
  
  :global(.tooltip) {
    position: absolute;
    padding: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ddd;
    border-radius: 4px;
    pointer-events: none;
    font-size: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    z-index: 1000;
    color: #000;
    font-family: 'Roboto', sans-serif;
  }
</style>
