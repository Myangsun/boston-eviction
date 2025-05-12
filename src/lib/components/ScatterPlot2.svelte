<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import { 
    scatterPlotData2, 
    selectedFlipindex, 
    selectedYear, 
    dataScales,
    backbaySelectedTracts,
    hoveredCensusTract,
    evictionData
  } from '$lib/stores.js';
  
  // DOM elements
  let chartContainer;
  let chart;
  let width;
  let height;
  let margin = { top: 40, right: 30, bottom: 50, left: 60 };
  let tooltip;
  
  // Store subscriptions
  let data;
  let Flipindex;
  let year;
  let allEvictionData = []; 
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  let isDragging = false;
  let draggedTract = null;
  let hoveredTract = null;
  
  // Add a flag to track if chart updating is allowed
  let allowChartUpdate = true;
  let lastFlipindex = null;
  
  // Add a keep-alive mechanism for the hover state
  let lastHoverTimestamp = 0;
  let hoverCheckInterval;
  
  // All available years for the data to enable time-based trajectories
  const availableYears = ['2020', '2021', '2022', '2023'];
  
  const unsubscribeData = scatterPlotData2.subscribe(value => {
    data = value;
    if (chart && allowChartUpdate) updateChart();
  });
  
  const unsubscribeFlipindex = selectedFlipindex.subscribe(value => {
    // Only update if the value actually changed
    if (Flipindex !== value) {
      console.log(`Flipindex changed from ${Flipindex} to ${value}`);
      lastFlipindex = Flipindex;
      Flipindex = value;
      
      // Force a complete redraw when the flipindex changes
      if (chart) {
        allowChartUpdate = true;
        updateChart(true); // true flag indicates a force update
      }
    }
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
    if (chart && allowChartUpdate) updateChart();
  });
  
  const unsubscribeDataScales = dataScales.subscribe(value => {
    scales = value;
    if (chart && allowChartUpdate) updateChart();
  });
  
  const unsubscribeEvictionData = evictionData.subscribe(value => {
    allEvictionData = value;
  });
  
  // Improved hover state handling for syncing with the map
  const unsubscribeHoveredTract = hoveredCensusTract.subscribe(tractId => {
    lastHoverTimestamp = Date.now(); // Update timestamp whenever a hover event occurs
    
    if (chart) {
      // Use a single transition instance for better performance
      const t = d3.transition().duration(200);
      
      // Reset all points to normal state first
      chart.selectAll('.points circle')
        .transition(t)
        .attr('r', 5)
        .style('opacity', hasSelectedTracts() ? 0.3 : 0.6)
        .style('stroke', 'transparent')
        .style('stroke-width', 0);
        
      chart.selectAll('.selected-points circle')
        .transition(t)
        .attr('r', 5)
        .style('opacity', 1)
        .style('stroke', 'none')
        .style('stroke-width', 0);
      
      // Then highlight the hovered tract if any
      if (tractId) {
        // Find both regular and selected points with this tract ID
        const regularPoint = chart.select('.points').selectAll('circle')
          .filter(d => d && d.tract_id === tractId);
          
        const selectedPoint = chart.select('.selected-points').selectAll('circle')
          .filter(d => d && d.tract_id === tractId);
        
        // Highlight regular point if it exists
        if (!regularPoint.empty()) {
          regularPoint
            .transition()
            .duration(150)
            .attr('r', 7)
            .style('opacity', 0.9)
            .style('stroke', '#2da88a') // Add stroke only on hover
            .style('stroke-width', 2);
        }
        
        // Highlight selected point if it exists
        if (!selectedPoint.empty()) {
          selectedPoint
            .transition()
            .duration(150)
            .attr('r', 7) // Same hover size (was 10)
            .style('stroke', '#2da88a') // Add stroke for selected when hovered
            .style('stroke-width', 2);
        }
        
        // Set local hover state and update trajectory
        hoveredTract = tractId;
        updateTrajectoriesAndLabels(window.xScale, window.yScale);
        
        // Show tooltip near the point (use either regular or selected point data)
        const pointData = regularPoint.empty() ? 
          (selectedPoint.empty() ? null : selectedPoint.datum()) : 
          regularPoint.datum();
          
        if (pointData && tooltip) {
          const xPos = window.xScale(pointData.x);
          const yPos = window.yScale(pointData.y);
          
          // Get container position for accurate positioning
          const containerRect = chartContainer.getBoundingClientRect();
          const tooltipX = containerRect.left + margin.left + xPos + 10;
          const tooltipY = containerRect.top + margin.top + yPos - 28;
          
          tooltip
            .style('left', `${tooltipX}px`)
            .style('top', `${tooltipY}px`)
            .html(`
              <strong>Census Tract:</strong> ${pointData.tract_id}<br>
              <strong>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}:</strong> $${pointData.x.toLocaleString()}<br>
              <strong>Eviction Rate:</strong> ${(pointData.y * 100).toFixed(1)}%
            `)
            .style('opacity', 0.9);
        }
      } else {
        // Clear hover state and hide tooltip when nothing is hovered
        hoveredTract = null;
        updateTrajectoriesAndLabels(window.xScale, window.yScale);
        
        if (tooltip) {
          tooltip
            .transition()
            .duration(200)
            .style('opacity', 0);
        }
      }
    }
  });
  
  // Helper function to check if there are selected tracts
  function hasSelectedTracts() {
    return $backbaySelectedTracts && $backbaySelectedTracts.length > 0;
  }
  
  // Improved get tract's data across all years for trajectories
  function getTractTrajectory(tractId) {
    if (!allEvictionData || !allEvictionData.length || !tractId) return [];
    
    // Find the tract data from the complete dataset
    const tractData = allEvictionData.find(d => 
      d.GEOID === tractId || d.tract_id === tractId || d.geoid === tractId
    );
    
    if (!tractData) return [];
    
    const trajectory = [];
    let x = 0;
    
    // Use the same x value (rent or price diff) for all points in trajectory
    if (Flipindex === 'median_rent') {
      x = +tractData.median_rent;
      if (isNaN(x) || x === 0) return [];
    } else if (Flipindex === 'median_price_diff') {
      x = +tractData.median_price_diff;
      if (isNaN(x)) return [];
      x = Math.min(x, scales.maxMedianPriceDiff); // Cap extreme values
    }
    
    // Create points for each year using the eviction rates
    availableYears.forEach(yr => {
      const rateKey = `eviction_rate_${yr}`;
      const y = +tractData[rateKey];
      
      // Only include years with valid data (less than 1)
      if (!isNaN(y) && y > 0 && y < 1) {
        trajectory.push({
          year: yr,
          x: x,
          y: y,
          tract_id: tractId
        });
      }
    });
    
    return trajectory;
  }
  
  // Update trajectories and labels for active tracts
  function updateTrajectoriesAndLabels(xScale, yScale) {
    if (!chart || !xScale || !yScale) return;
    
    // Clear previous trajectories and labels
    chart.select('.trajectories').selectAll('*').remove();
    chart.select('.trajectory-labels').selectAll('*').remove();
    
    // Active tracts are those being hovered, dragged, or selected
    const activeTracts = new Set();
    if (hoveredTract) activeTracts.add(hoveredTract);
    if (draggedTract) activeTracts.add(draggedTract);
    
    // For each active tract, draw the trajectory
    activeTracts.forEach(tractId => {
      const trajectory = getTractTrajectory(tractId);
      
      if (trajectory && trajectory.length > 1) {
        // Create the path using d3 line generator
        const lineGenerator = d3.line()
          .x(d => xScale(d.x))
          .y(d => yScale(d.y));
        
        const path = lineGenerator(trajectory);
        
        chart.select('.trajectories')
          .append('path')
          .attr('d', path)
          .attr('stroke', '#88e4cc') // Teal color to match Back Bay theme
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
            .attr('fill', point.year === year ? '#88e4cc' : '#ddd')
            .attr('opacity', 0.8);
        });
      }
    });
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
    
    // Find closest point to mouse position
    screenPoints.forEach(point => {
      const dx = mx - point.x;
      const dy = my - point.y;
      const dist = dx * dx + dy * dy;
      
      if (dist < bestDist) {
        bestDist = dist;
        bestYear = point.year;
      }
    });
    
    return bestYear;
  }
  
  // Set Flipindex type with improved logging and state management
  function setFlipindex(type) {
    console.log(`Setting Flipindex to ${type} from button click`);
    
    // Only update if the value is actually changing
    if (type !== Flipindex) {
      // Allow the update to propagate
      allowChartUpdate = true;
      selectedFlipindex.set(type);
      
      // Force a redraw after a short delay to ensure store updates have propagated
      setTimeout(() => {
        if (chart) updateChart(true); // Force update
      }, 50);
    }
  }
  
  // Initialize chart on mount with proper styling
  let chartInitialized = false;
  
  onMount(() => {
    console.log("ScatterPlot2 component mounted");
    initializeChart();
    
    // Force immediate data processing and proper styling
    setTimeout(() => {
      chartInitialized = true;
      allowChartUpdate = true;
      
      if (data && chart) {
        updateChart(true); // Force update on mount
        
        // Immediately apply correct styling to selected points
        chart.selectAll('.selected-points circle')
          .attr('r', 5) // Same size as regular points
          .style('fill', '#88e4cc') // Teal for Back Bay
          .style('opacity', 1)
          .style('stroke', 'none')
          .style('stroke-width', 0)
          .style('filter', 'drop-shadow(0px 0px 2px rgba(0,0,0,0.5))');
        
        // If any tracts are already selected, show trajectories for first one
        if ($backbaySelectedTracts && $backbaySelectedTracts.length > 0) {
          const firstSelectedTract = $backbaySelectedTracts[0];
          hoveredTract = firstSelectedTract;
          if (window.xScale && window.yScale) {
            updateTrajectoriesAndLabels(window.xScale, window.yScale);
          }
        }
        
        // Also force the chart to handle any hoveredCensusTract
        if ($hoveredCensusTract) {
          handleHoveredTract($hoveredCensusTract);
        }
      }
      
      // Set up a keep-alive interval to check for stale hover states
      hoverCheckInterval = setInterval(() => {
        const currentTime = Date.now();
        // If it's been more than 30 seconds since the last hover event and we have a saved hover state
        if (currentTime - lastHoverTimestamp > 30000 && $hoveredCensusTract) {
          // Reapply the current hover state to refresh the visual elements
          handleHoveredTract($hoveredCensusTract);
          lastHoverTimestamp = currentTime;
        }
      }, 10000); // Check every 10 seconds
    }, 100);
    
    // Cleanup on component destroy
    return () => {
      unsubscribeData();
      unsubscribeFlipindex();
      unsubscribeYear();
      unsubscribeDataScales();
      unsubscribeEvictionData();
      unsubscribeHoveredTract();
      if (chart) chart.selectAll('*').remove();
      if (hoverCheckInterval) clearInterval(hoverCheckInterval);
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
    
    // Add a group for trajectories that will be drawn under points
    chart.append('g')
      .attr('class', 'trajectories');
      
    // Add a group for year labels along trajectories
    chart.append('g')
      .attr('class', 'trajectory-labels');
      
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
    
    // Create tooltip with fixed positioning for better performance
    tooltip = d3.select(chartContainer)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'fixed') // Use fixed positioning to avoid layout shifts
      .style('z-index', 1000)
      .style('pointer-events', 'none') // Prevent tooltip from capturing mouse events
      .style('transition', 'opacity 0.15s ease'); // Add smooth transition
    
    // Reset update count after initialization
    updateCount = 0;
    // Call updateChart once at initialization
    updateChart();
  }
  
  // Add state to track if the chart was already updated
  let chartUpdated = false;
  let updateCount = 0;
  const MAX_UPDATES = 10; // Increased to allow more updates when needed

  // Update the chart with new data
  function updateChart(forceUpdate = false) {
    // Skip if force update is not requested and updates are disabled
    if (!forceUpdate && !allowChartUpdate) {
      console.log("Chart update skipped - updates currently disabled");
      return;
    }
    
    // Prevent excessive updates unless forced
    if (!forceUpdate && !chartInitialized) {
      console.log("Chart update skipped - chart not initialized");
      return;
    }

    if (!forceUpdate && updateCount >= MAX_UPDATES) {
      console.log("Max update count reached, skipping update");
      return;
    }

    updateCount++;
    console.log(`Chart update #${updateCount}, force: ${forceUpdate}, flipindex: ${Flipindex}`);
    
    if (!chart || !data || !data.allPoints || !data.allPoints.length) {
      console.log("Cannot update chart - missing data or chart not ready");
      return;
    }
    
    console.log("Updating scatter plot with data points:", data.allPoints.length);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create separate scales for each indicator
    let xScale;
    let xMin, xMax;

    if (Flipindex === 'median_rent') {
      xMin = scales.minMedianRent || 394;
      xMax = scales.maxMedianRent || 3501;
    } else if (Flipindex === 'median_price_diff') {
      xMin = scales.minMedianPriceDiff || -46625;
      xMax = scales.maxMedianPriceDiff || 134500;
    }

    // Create the scale
    xScale = d3.scaleLinear()
      .domain([xMin, xMax])
      .range([0, innerWidth]);
      
    const yScale = d3.scaleLinear()
      .domain([0, data.maxY || scales.maxEvictionRate || 0.5])
      .range([innerHeight, 0]);
    
    // Store scales globally for trajectory calculations
    window.xScale = xScale;
    window.yScale = yScale;
    
    // Update axes
    let xAxis;
    if (Flipindex === 'median_rent') {
      xAxis = d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d => `$${d.toLocaleString()}`);
    } else {
      xAxis = d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d => `$${d >= 0 ? '+' : ''}${d.toLocaleString()}`);
    }

    chart.select('.x-axis')
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#000');
    
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);
    
    chart.select('.y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#000');
    
    // Update labels
    chart.select('.x-label')
      .text(Flipindex === 'median_rent' ? 'Median Rent ($)' : 'Median Price Difference ($)');
    
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
      .text(`Boston Average (${Flipindex === 'median_rent' ? '$' + avgX.toLocaleString() : '$' + avgX.toLocaleString()}, ${(avgY * 100).toFixed(1)}%)`);
    
    // Draw trajectories before points so they appear underneath
    updateTrajectoriesAndLabels(xScale, yScale);
    
    // Check if any tracts are selected to adjust opacity
    const hasSelectedTracts = $backbaySelectedTracts && $backbaySelectedTracts.length > 0;
    
    // Update regular points
    const points = chart.select('.points')
      .selectAll('circle')
      .data(data.allPoints.filter(d => !d.selected));
    
    points.exit().remove();
    
    const newPoints = points.enter()
      .append('circle')
      .attr('class', 'point-circle');
      
    // Merge and update all points
    newPoints.merge(points)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5)
      .style('fill', '#aaa')
      .style('stroke', 'transparent') // Setting initial stroke to transparent
      .style('stroke-width', 0)
      .style('opacity', hasSelectedTracts ? 0.3 : 0.6) // Lower opacity if any tracts are selected
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(150) // Faster transition
          .attr('r', 7)
          .style('stroke', '#2da88a')
          .style('stroke-width', 2)
          .style('opacity', hasSelectedTracts ? 0.6 : 0.8);
          
        // Update local hover state and map highlight
        hoveredTract = d.tract_id;
        hoveredCensusTract.set(d.tract_id);
        
        // Update tooltip without jQuery-like chaining for better performance
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px')
          .html(`
            <strong>Census Tract:</strong> ${d.tract_id}<br>
            <strong>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}:</strong> $${d.x.toLocaleString()}<br>
            <strong>Eviction Rate:</strong> ${(d.y * 100).toFixed(1)}%
          `)
          .style('opacity', 0.9);
      })
      .on('mouseout', function() {
        if (!isDragging) {
          d3.select(this).transition()
            .duration(250) // Smoother transition
            .attr('r', 5)
            .style('stroke', 'transparent')
            .style('stroke-width', 0)
            .style('opacity', hasSelectedTracts ? 0.3 : 0.6);
          
          hoveredTract = null;
          hoveredCensusTract.set(null);
          
          // Hide tooltip
          tooltip.style('opacity', 0);
        }
      })
      .on('click', function(event, d) {
        // When a non-selected point is clicked, add it to the Back Bay selection
        backbaySelectedTracts.update(selected => 
          selected.includes(d.tract_id) ? selected : [...selected, d.tract_id]
        );
        
        // Update hover state but don't clear it
        hoveredTract = d.tract_id;
      });
    
    // Update selected points - matched with ScatterPlot style
    const selectedPoints = chart.select('.selected-points')
      .selectAll('circle')
      .data(data.allPoints.filter(d => d.selected));
    
    selectedPoints.exit().remove();
    
    const newSelectedPoints = selectedPoints.enter()
      .append('circle')
      .attr('class', 'selected-circle'); // Add class for easier selection
      
    // Merge and update all selected points with consistent styling
    newSelectedPoints.merge(selectedPoints)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5) // Same size as regular points
      .style('fill', '#88e4cc') // Keep Back Bay teal color
      .style('opacity', 1)
      .style('stroke', 'none') // No outline
      .style('stroke-width', 0)
      .style('filter', 'drop-shadow(0px 0px 2px rgba(0,0,0,0.5))') // Add drop shadow
      .on('mouseover', function(event, d) {
        d3.select(this).transition()
          .duration(150)
          .attr('r', 7); // Hover size
        
        // Update hover state and map highlight
        hoveredTract = d.tract_id;
        hoveredCensusTract.set(d.tract_id);
        
        // Update tooltip
        tooltip.html(`
          <strong>Census Tract:</strong> ${d.tract_id}<br>
          <strong>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}:</strong> $${d.x.toLocaleString()}<br>
          <strong>Eviction Rate:</strong> ${(d.y * 100).toFixed(1)}%
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px')
        .style('opacity', 0.9);
      })
      .on('mouseout', function() {
        if (!isDragging) {
          d3.select(this).transition()
            .duration(250)
            .attr('r', 5)
            .style('stroke-width', 1);
          
          hoveredTract = null;
          hoveredCensusTract.set(null);
          
          // Hide tooltip
          tooltip.style('opacity', 0);
        }
      })
      .on('click', function(event, d) {
        // When a selected point is clicked, remove it from the selection
        backbaySelectedTracts.update(selected => 
          selected.filter(id => id !== d.tract_id)
        );
        
        hoveredTract = null;
        hoveredCensusTract.set(null);
      });
    
    // Add drag behavior to all points for trajectory interaction
    chart.selectAll('.point-circle, .selected-circle')
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
    
    // Temporarily disable updates after this one completes to avoid cascading updates
    if (!forceUpdate) {
      allowChartUpdate = false;
      setTimeout(() => {
        allowChartUpdate = true;
      }, 200); // Re-enable after a short delay
    }
  }
  
  // Add a dedicated function to handle hover state for the component initialization
  function handleHoveredTract(tractId) {
    if (!chart || !chartInitialized) return;
    
    try {
      // Reset all points
      chart.selectAll('.points circle')
        .attr('r', 5)
        .style('opacity', hasSelectedTracts() ? 0.3 : 0.6)
        .style('stroke', 'transparent')
        .style('stroke-width', 0);
        
      chart.selectAll('.selected-points circle')
        .attr('r', 5)
        .style('opacity', 1)
        .style('stroke', 'none')
        .style('stroke-width', 0);
      
      // Then highlight if there's a tract ID
      if (tractId) {
        // Find points with this tract ID
        const regularPoint = chart.select('.points').selectAll('circle')
          .filter(d => d && d.tract_id === tractId);
          
        const selectedPoint = chart.select('.selected-points').selectAll('circle')
          .filter(d => d && d.tract_id === tractId);
        
        // Highlight regular point
        if (!regularPoint.empty()) {
          regularPoint
            .attr('r', 7)
            .style('opacity', 0.9)
            .style('stroke', '#2da88a')
            .style('stroke-width', 2);
        }
        
        // Highlight selected point
        if (!selectedPoint.empty()) {
          selectedPoint
            .attr('r', 7)
            .style('stroke', '#2da88a')
            .style('stroke-width', 2);
        }
        
        // Set hover state and draw trajectory
        hoveredTract = tractId;
        updateTrajectoriesAndLabels(window.xScale, window.yScale);
      }
    } catch (error) {
      console.error("Error in handleHoveredTract:", error);
    }
  }

  // Add a proper refresh function that forces a complete redraw
  function refreshScatterPlot() {
    console.log("Forcing scatter plot refresh");
    allowChartUpdate = true;
    updateCount = 0; // Reset update count
    
    if (chart && data) {
      // Force a complete redraw
      updateChart(true);
    }
    
    // Also refresh hover state if needed
    refreshHoverState();
  }

  function refreshHoverState() {
    if ($hoveredCensusTract) {
      handleHoveredTract($hoveredCensusTract);
      lastHoverTimestamp = Date.now(); // Update the timestamp when manually refreshing
    }
  }

  // Export the refresh functions
  export { refreshHoverState, refreshScatterPlot };
</script>

<div class="chart-container">
  <div bind:this={chartContainer} class="chart"></div>
  <div class="chart-controls">
    <button 
      class:active={Flipindex === 'median_rent'} 
      on:click={() => setFlipindex('median_rent')}>
      Rent 
    </button>
    <button 
      class:active={Flipindex === 'median_price_diff'} 
      on:click={() => setFlipindex('median_price_diff')}>
      Flip Difference
    </button>
  </div>
  <div class="chart-explanation">
    <p>Flipping refers to selling a property within two years of its purchase, excluding foreclosures and same-day sales. The price difference between flips refers to the transaction price difference between the original purchase and the resale within that short period.
    </p>
    <p class="trajectory-note">Hover over or drag points to see eviction rate trajectories across different years.</p>
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
    background-color: #88e4cc; /* Changed from #EEB0C2 to #88e4cc */
    color: black;
    border-color: #88e4cc; /* Changed from #EEB0C2 to #88e4cc */
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
  
  /* Highlight the contrast between selected and non-selected points */
  :global(.points circle) {
    transition: opacity 0.3s ease, r 0.2s ease;
  }
  
  :global(.selected-points circle) {
    transition: r 0.2s ease;
    filter: drop-shadow(0px 0px 3px rgba(0,0,0,0.3)); /* Add subtle shadow to selected points */
  }
  .trajectory-note {
    font-size: 0.85rem;
    color: #666;
    font-style: italic;
    margin-top: 0.5rem;
  }
  
  :global(.selected-points circle) {
    transition: r 0.2s ease;
    filter: drop-shadow(0px 0px 2px rgba(0,0,0,0.5)) !important;
    stroke: none !important;
    stroke-width: 0 !important;
  }
</style>