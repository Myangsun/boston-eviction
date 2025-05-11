<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import { scatterPlotData, selectedInvestorType, selectedYear, dataScales, dorchesterSelectedTracts, hoveredCensusTract } from '$lib/stores.js';
  
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
  let isDragging = false;
  let draggedTract = null;
  let hoveredTract = null;
  
  // All available years for the data to enable time-based trajectories
  const availableYears = ['2020', '2021', '2022', '2023'];
  
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

  // Add subscription to hoveredCensusTract for highlighting points from map
  const unsubscribeHoveredTract = hoveredCensusTract.subscribe(value => {
    if (chart) {
      // First, reset all points to normal state
      chart.selectAll('.points circle, .selected-points circle')
        .each(function(d) {
          const circle = d3.select(this);
          const isSelected = circle.classed('selected-circle') || 
                            (d && $dorchesterSelectedTracts.includes(d.tract_id));
          
          // Use d3's transition performance optimization approach
          const t = d3.transition().duration(200);
          
          circle
            .transition(t)
            .attr('r', isSelected ? 8 : 5)
            .style('opacity', isSelected ? 1 : (hasSelectedTracts() ? 0.3 : 0.6))
            .style('stroke', 'transparent')
            .style('stroke-width', 0);
        });
      
      // Then, highlight the hovered tract if any
      if (value) {
        chart.selectAll('.points circle, .selected-points circle')
          .filter(d => d && d.tract_id === value)
          .transition()
          .duration(150) // Faster transition for more responsive feel
          .attr('r', d => $dorchesterSelectedTracts.includes(d.tract_id) ? 10 : 7)
          .style('opacity', 0.9)
          .style('stroke', '#EEB0C2')
          .style('stroke-width', 2);
          
        // Also show trajectory for hovered tract
        hoveredTract = value;
        updateTrajectoriesAndLabels(window.xScale, window.yScale);
        
        // Show tooltip for the hovered tract
        const hoveredPoint = chart.selectAll('.points circle, .selected-points circle')
          .filter(d => d && d.tract_id === value);
        
        if (!hoveredPoint.empty()) {
          const pointData = hoveredPoint.datum();
          const tooltipDiv = d3.select('.tooltip');
          const xPos = window.xScale(pointData.x);
          const yPos = window.yScale(pointData.y);
          
          // Get chart container position
          const containerRect = chartContainer.getBoundingClientRect();
          const tooltipX = containerRect.left + margin.left + xPos + 10;
          const tooltipY = containerRect.top + margin.top + yPos - 28;
          
          tooltipDiv.html(`
            <strong>Census Tract:</strong> ${pointData.tract_id}<br>
            <strong>${investorType.charAt(0).toUpperCase() + investorType.slice(1)} Investors:</strong> ${pointData.x}<br>
            <strong>Eviction Rate:</strong> ${(pointData.y * 100).toFixed(1)}%
          `)
          .style('left', tooltipX + 'px')
          .style('top', tooltipY + 'px')
          .style('opacity', 0.9);
        }
      } else {
        hoveredTract = null;
        updateTrajectoriesAndLabels(window.xScale, window.yScale);
        
        // Hide tooltip when not hovering
        d3.select('.tooltip')
          .style('opacity', 0);
      }
    }
  });
  
  // Helper function to check if there are selected tracts
  function hasSelectedTracts() {
    return $dorchesterSelectedTracts && $dorchesterSelectedTracts.length > 0;
  }
  
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
      unsubscribeHoveredTract(); // Add this line
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
  
  // Get a tract's data across all years
  // Fix: Initialize the allYearsData object if not available in data store
  function getTractTrajectory(tractId) {
    if (!data || !data.allYearsData) return [];
    
    const trajectory = [];
    
    // Use the pre-calculated data for all years
    availableYears.forEach(yr => {
      if (data.allYearsData[yr]) {
        const tractData = data.allYearsData[yr].find(d => d.tract_id === tractId);
        if (tractData) {
          trajectory.push({
            year: yr,
            x: tractData.x, 
            y: tractData.y,
            tract_id: tractId
          });
        }
      }
    });
    
    return trajectory;
  }
  
  // Generate a path for the tract trajectory
  function getTractPath(tractId, xScale, yScale) {
    const points = getTractTrajectory(tractId);
    if (points.length < 2) return "";
    
    const line = d3.line()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y));
      
    return line(points);
  }
  
  // Update the year based on drag position
  function updateYearFromDrag(mx, my, tractId) {
    const trajectory = getTractTrajectory(tractId);
    if (trajectory.length < 2) return year;
    
    // Convert trajectory points to screen coordinates
    const screenPoints = trajectory.map(d => ({
      x: xScale(d.x),
      y: yScale(d.y),
      year: d.year
    }));
    
    let bestDist = Infinity;
    let bestYear = year;
    
    // For each segment, project the mouse
    for (let i = 0; i < screenPoints.length - 1; i++) {
      const A = screenPoints[i],
            B = screenPoints[i + 1];
      const ABx = B.x - A.x,
            ABy = B.y - A.y,
            APx = mx - A.x,
            APy = my - A.y,
            ab2 = ABx * ABx + ABy * ABy;
            
      let t = ab2 ? (APx * ABx + APy * ABy) / ab2 : 0;
      t = Math.max(0, Math.min(1, t));
      
      const projX = A.x + t * ABx,
            projY = A.y + t * ABy,
            dx = mx - projX,
            dy = my - projY,
            dist = dx * dx + dy * dy;
            
      if (dist < bestDist) {
        bestDist = dist;
        // Interpolate year between points
        const idx1 = availableYears.indexOf(A.year);
        const idx2 = availableYears.indexOf(B.year);
        
        // Simple interpolation between the two year indices
        const yearIdx = idx1 + t * (idx2 - idx1);
        bestYear = availableYears[Math.round(yearIdx)];
      }
    }
    
    return bestYear;
  }
  
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
    
    // Add a group for trajectories that will be drawn under points
    chart.append('g')
      .attr('class', 'trajectories');
      
    // Add a group for year labels along trajectories
    chart.append('g')
      .attr('class', 'trajectory-labels');
    
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
    
    // Store scales globally for trajectory calculations
    window.xScale = xScale;
    window.yScale = yScale;
    
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
    
    // Update trajectories and labels
    updateTrajectoriesAndLabels(xScale, yScale);
    
    // First determine if any tracts are selected to adjust opacity
    const hasSelectedTracts = $dorchesterSelectedTracts && $dorchesterSelectedTracts.length > 0;
    
    // Update points - unselected points
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
      .style('opacity', hasSelectedTracts ? 0.3 : 0.6) // Lower opacity if any tracts are selected
      .on('click', function(event, d) {
          // When a non-selected point is clicked, add it to the selection 
          dorchesterSelectedTracts.update(selected =>
            selected.includes(d.tract_id) ? selected : [...selected, d.tract_id]
          );
          // Show trajectory when clicked
          hoveredTract = d.tract_id;
          updateTrajectoriesAndLabels(xScale, yScale);
      })
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(200)
          .attr('r', 7)
          .style('opacity', hasSelectedTracts ? 0.6 : 0.8); // Increase opacity on hover
          
        // Update local hover state
        hoveredTract = d.tract_id;
        
        // Highlight the same tract on the map
        hoveredCensusTract.set(d.tract_id);
        
        // Show trajectory
        updateTrajectoriesAndLabels(xScale, yScale);
          
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
          .style('opacity', hasSelectedTracts ? 0.3 : 0.6); // Return to normal opacity
          
        if (!isDragging) {
          hoveredTract = null;
          
          // Remove highlight on the map
          hoveredCensusTract.set(null);
          
          updateTrajectoriesAndLabels(xScale, yScale);
        }
          
        d3.select('.tooltip').transition()
          .duration(500)
          .style('opacity', 0);
      })
      .call(d3.drag()
        .on("start", function(event, d) {
          event.sourceEvent.stopPropagation(); // prevent propagation
          isDragging = true;
          draggedTract = d.tract_id;
          updateTrajectoriesAndLabels(xScale, yScale);
        })
        .on("drag", function(event, d) {
          const [mx, my] = d3.pointer(event, chart.node());
          const newYear = updateYearFromDrag(mx, my, d.tract_id);
          if (newYear !== year) {
            selectedYear.set(newYear);
          }
        })
        .on("end", function() {
          isDragging = false;
          draggedTract = null;
          updateTrajectoriesAndLabels(xScale, yScale);
        })
      );
    
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
      .attr('r', 8) // Make larger and consistent with ScatterPlot2 (was 6)
      .style('fill', '#EEB0C2')
      .style('stroke', '#000') // Add stroke to match ScatterPlot2
      .style('stroke-width', 1) // Add stroke width to match ScatterPlot2
      .style('opacity', 1) // Full opacity for selected points (was 0.8)
      .on('click', function(event, d) {
        // Deselect the tract in the map when clicked in the scatter plot
        dorchesterSelectedTracts.update(selected => selected.filter(id => id !== d.tract_id));
        hoveredTract = null;
        hoveredCensusTract.set(null);
        updateTrajectoriesAndLabels(xScale, yScale);
      })
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(200)
          .attr('r', 10); // Increase size on hover (was 8)
          
        hoveredTract = d.tract_id;
        hoveredCensusTract.set(d.tract_id);
        updateTrajectoriesAndLabels(xScale, yScale);
          
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
          .attr('r', 8); // Return to normal size (was 6)
          
        if (!isDragging) {
          hoveredTract = null;
          hoveredCensusTract.set(null);
          updateTrajectoriesAndLabels(xScale, yScale);
        }
          
        d3.select('.tooltip').transition()
          .duration(500)
          .style('opacity', 0);
      })
      .call(d3.drag()
        .on("start", function(event, d) {
          event.sourceEvent.stopPropagation();
          isDragging = true;
          draggedTract = d.tract_id;
          updateTrajectoriesAndLabels(xScale, yScale);
        })
        .on("drag", function(event, d) {
          const [mx, my] = d3.pointer(event, chart.node());
          const newYear = updateYearFromDrag(mx, my, d.tract_id);
          if (newYear !== year) {
            selectedYear.set(newYear);
          }
        })
        .on("end", function() {
          isDragging = false;
          draggedTract = null;
          updateTrajectoriesAndLabels(xScale, yScale);
        })
      );
  }
  
  // Update trajectories and labels for active tracts
  // Fix: Make sure chart and scales are defined before using
  function updateTrajectoriesAndLabels(xScale, yScale) {
    if (!chart || !xScale || !yScale) return;
    
    // Clear previous trajectories and labels
    chart.select('.trajectories').selectAll('*').remove();
    chart.select('.trajectory-labels').selectAll('*').remove();
    
    // Active tracts are those being hovered, dragged, or selected
    const activeTracts = new Set();
    if (hoveredTract) activeTracts.add(hoveredTract);
    if (draggedTract) activeTracts.add(draggedTract);
    
    // For debugging
    console.log("Active tracts:", Array.from(activeTracts));
    
    activeTracts.forEach(tractId => {
      console.log("Processing trajectory for tract:", tractId);
      
      // Draw trajectory path
      const trajectory = getTractTrajectory(tractId);
      
      if (trajectory && trajectory.length > 0) {
        console.log("Drawing trajectory with points:", trajectory.length);
        
        // Create the path using d3 line generator
        const lineGenerator = d3.line()
          .x(d => xScale(d.x))
          .y(d => yScale(d.y));
        
        const path = lineGenerator(trajectory);
        
        // Log the path string for debugging
        console.log("Path data:", path?.substring(0, 50) + "...");
        
        chart.select('.trajectories')
          .append('path')
          .attr('d', path)
          .attr('stroke', '#999')
          .attr('stroke-width', 2)
          .attr('fill', 'none')
          .attr('stroke-dasharray', '5,5')
          .lower();
          
        // Add year markers along the trajectory
        trajectory.forEach(point => {
          chart.select('.trajectory-labels')
            .append('text')
            .attr('x', xScale(point.x))
            .attr('y', yScale(point.y) - 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .style('fill', point.year === year ? '#000' : '#777')
            .text(point.year);
            
          chart.select('.trajectory-labels')
            .append('circle')
            .attr('cx', xScale(point.x))
            .attr('cy', yScale(point.y))
            .attr('r', point.year === year ? 6 : 3)
            .attr('fill', point.year === year ? '#EEB0C2' : '#ddd')
            .attr('opacity', 0.8);
        });
      } else {
        console.log("No trajectory data found for tract:", tractId);
      }
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
  
  /* Add styles for interactivity on points */
  :global(.trajectories path) {
    pointer-events: none;
  }
  
  :global(.trajectory-labels text, .trajectory-labels circle) {
    pointer-events: none;
  }
  
  /* highlight styles */
  :global(.trajectory-current-year) {
    font-weight: bold;
  }

  /* Highlight the contrast between selected and non-selected points */
  :global(.points circle) {
    transition: opacity 0.3s ease, r 0.2s ease;
  }
  
  :global(.selected-points circle) {
    transition: r 0.2s ease;
    filter: drop-shadow(0px 0px 3px rgba(0,0,0,0.3)); /* Add subtle shadow to selected points */
  }
</style>
