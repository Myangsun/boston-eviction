<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { evictionData, boundaryData, visibleLayers, selectedYear, dataScales } from '$lib/stores.js';
  import { getMapboxToken } from '$lib/mapboxConfig.js';
  
  let mapContainer;
  let map;
  let legend;
  
  // Subscribe to store values
  let layers = {};
  let year;
  let data = [];
  let boundaries = {};
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  
  const unsubscribeVisibleLayers = visibleLayers.subscribe(value => {
    layers = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeEvictionData = evictionData.subscribe(value => {
    data = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeBoundaryData = boundaryData.subscribe(value => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeDataScales = dataScales.subscribe(value => {
    scales = value;
    if (map) updateMapLayers();
  });
  
  // Initialize map on component mount
  onMount(() => {
    console.log("CitySection component mounted");
    
    try {
      // Get Mapbox token from config
      const mapboxToken = getMapboxToken();
      mapboxgl.accessToken = mapboxToken;
      console.log("City map token set:", mapboxToken);
      
      map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.06, 42.31], // Boston approximate center
        zoom: 11,
        minZoom: 9,
        maxZoom: 15,
        interactive: true // Enable map interactions
      });
      
      console.log("City map initialized");
      
      // Create legend
      legend = document.createElement('div');
      legend.className = 'map-legend';
      mapContainer.appendChild(legend);
      
      map.on('load', () => {
        console.log("City map loaded event fired");
        // Add sources and layers once map is loaded
        initializeMapLayers();
        
        // Add popup on hover
        map.on('mouseenter', 'boston-fill', (e) => {
          if (e.features.length > 0) {
            const feature = e.features[0];
            const tractId = feature.properties.tract_id;
            const investorType = Object.keys(layers).find(key => 
              layers[key] && ['institutional', 'large', 'medium', 'small'].includes(key)
            ) || 'institutional';
            const investorCount = feature.properties.investor_count;
            const evictionRate = feature.properties.eviction_rate;
            
            // Create popup
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <h4>Census Tract</h4>
                <p>GEOID: ${tractId}</p>
                <p>${investorType.charAt(0).toUpperCase() + investorType.slice(1)} Investors: ${investorCount}</p>
                <p>Eviction Rate (${year}): ${(evictionRate * 100).toFixed(1)}%</p>
              `)
              .addTo(map);
          }
          
          map.getCanvas().style.cursor = 'pointer';
        });
        
        map.on('mouseleave', 'boston-fill', () => {
          map.getCanvas().style.cursor = '';
          const popups = document.getElementsByClassName('mapboxgl-popup');
          if (popups.length) {
            popups[0].remove();
          }
        });
      });
      
      map.on('error', (e) => {
        console.error("City map error:", e);
      });
    } catch (error) {
      console.error("Error initializing city map:", error);
    }
    
    // Cleanup on component destroy
    return () => {
      unsubscribeVisibleLayers();
      unsubscribeYear();
      unsubscribeEvictionData();
      unsubscribeBoundaryData();
      unsubscribeDataScales();
      if (map) map.remove();
      if (legend && legend.parentNode) {
        legend.parentNode.removeChild(legend);
      }
    };
  });
  
  // Initialize map layers
  function initializeMapLayers() {
    try {
      console.log("Initializing city map layers");
      if (!map.getSource('boston-data')) {
        // Add source for Boston census tracts
        map.addSource('boston-data', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

      // Add fill layer for choropleth
      map.addLayer({
        id: 'boston-fill',
        type: 'fill',
        source: 'boston-data',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'investor_count'],
            0, '#fae8ee',
            10, '#f8d0db',
            20, '#EEB0C2',
            30, '#d4899e',
            40, '#c06c84'
          ],
          'fill-opacity': 0.7
        },
        filter: ['==', '$type', 'Polygon']  // Only apply to polygon features
      });

      // Add eviction circles layer
      map.addLayer({
        id: 'boston-evictions',
        type: 'circle',
        source: 'boston-data',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'eviction_rate'],
            0, 5,
            0.05, 10,
            0.1, 15,
            0.2, 20
          ],
          'circle-color': 'black',
          'circle-opacity': 0.6
        },
        layout: {
          'visibility': 'visible'
        },
        filter: ['==', '$type', 'Point']  // Only apply to point features
      });

      }
      
      updateMapLayers();
    } catch (error) {
      console.error("Error initializing city map layers:", error);
    }
  }
  
  // Update map layers based on current data and selections
  function updateMapLayers() {
    try {
      if (!map || !map.getSource('boston-data')) {
        console.log("Cannot update city map layers yet - map source not ready");
        return;
      }
      
      if (!data || !data.length) {
        console.log("Cannot update city map layers yet - no data available");
        return;
      }
      
      if (!boundaries || !boundaries.features) {
        console.log("Cannot update city map layers yet - no boundary data available");
        return;
      }
      
      console.log("Updating city map layers with data");
      console.log("Data points:", data.length);
      console.log("Boundaries features:", boundaries.features.length);
      
      // Determine which investor type to display based on visible layers
      const investorType = Object.keys(layers).find(key => 
        layers[key] && ['institutional', 'large', 'medium', 'small'].includes(key)
      ) || 'institutional';
      
      // In the updateMapLayers function, change this part:

      // Create GeoJSON features from tract data by joining with boundary data
      const features = [];

      // Loop through all census tracts in the data
      data.forEach(tract => {
        // Find corresponding boundary feature in the GeoJSON
        const boundaryFeature = boundaries.features.find(f => 
          f.properties.geoid === tract.GEOID
        );
        
        if (boundaryFeature) {
          // Determine visibility based on selected layers
          const isVisible = Object.keys(layers).some(type => 
            layers[type] && ['institutional', 'large', 'medium', 'small'].includes(type) && 
            tract[`sum_${type}_investor`] > 0
          );
          
          if (isVisible) {
            // Calculate centroid for the eviction circle
            let centroid = calculateCentroid(boundaryFeature.geometry);
            
            // Create a feature with the geometry from the GeoJSON and properties from the CSV
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: centroid
              },
              properties: {
                tract_id: tract.GEOID,
                investor_count: Number(tract[`sum_${investorType}_investor`]) || 0,
                eviction_rate: Number(tract[`eviction_rate_${year}`]) || 0
              }
            });
            
            // Also add the polygon feature for the fill
            features.push({
              type: 'Feature',
              geometry: boundaryFeature.geometry,
              properties: {
                tract_id: tract.GEOID,
                investor_count: Number(tract[`sum_${investorType}_investor`]) || 0,
                eviction_rate: Number(tract[`eviction_rate_${year}`]) || 0
              }
            });
          }
        }
      });

            
      console.log("Created city map features:", features.length);
      
      // Update source data
      map.getSource('boston-data').setData({
        type: 'FeatureCollection',
        features
      });
      
      // Update fill layer color scale based on global max values
      if (scales.maxInvestorCount > 0) {
        map.setPaintProperty('boston-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'investor_count'],
          0, '#fae8ee',
          scales.maxInvestorCount * 0.25, '#f8d0db',
          scales.maxInvestorCount * 0.5, '#EEB0C2',
          scales.maxInvestorCount * 0.75, '#d4899e',
          scales.maxInvestorCount, '#c06c84'
        ]);
      }
      
      // Update circle radius scale based on global max values
      if (scales.maxEvictionRate > 0) {
        map.setPaintProperty('boston-evictions', 'circle-radius', [
          'interpolate',
          ['linear'],
          ['get', 'eviction_rate'],
          0, 5,
          scales.maxEvictionRate * 0.25, 10,
          scales.maxEvictionRate * 0.5, 15,
          scales.maxEvictionRate * 0.75, 20,
          scales.maxEvictionRate, 25
        ]);
      }
      
      // Update layer visibility
      map.setLayoutProperty('boston-evictions', 'visibility', 
        layers.evictions ? 'visible' : 'none'
      );
      
      // Update legend
      updateLegend(investorType);
      
      // Fit map to Boston boundaries if features exist and map is not being interacted with
      if (features.length > 0 && !map.isMoving() && !map.isZooming() && !map.isRotating()) {
        const bounds = new mapboxgl.LngLatBounds();
        
        features.forEach(feature => {
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates[0].forEach(coord => {
              bounds.extend(coord);
            });
          } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(polygon => {
              polygon[0].forEach(coord => {
                bounds.extend(coord);
              });
            });
          } else if (feature.geometry.type === 'Point') {
            bounds.extend(feature.geometry.coordinates);
          }
        });
        
        map.fitBounds(bounds, {
          padding: 40,
          duration: 1000
        });
      }
    } catch (error) {
      console.error("Error updating city map layers:", error);
    }
  }
  
  // Calculate centroid of a geometry
  function calculateCentroid(geometry) {
    try {
      if (geometry.type === 'Polygon') {
        // Use the first ring of coordinates (outer ring)
        const coords = geometry.coordinates[0];
        let sumX = 0;
        let sumY = 0;
        
        coords.forEach(coord => {
          sumX += coord[0];
          sumY += coord[1];
        });
        
        return [sumX / coords.length, sumY / coords.length];
      } else if (geometry.type === 'MultiPolygon') {
        // Use the first polygon's first ring
        const coords = geometry.coordinates[0][0];
        let sumX = 0;
        let sumY = 0;
        
        coords.forEach(coord => {
          sumX += coord[0];
          sumY += coord[1];
        });
        
        return [sumX / coords.length, sumY / coords.length];
      }
      
      // Default fallback
      return [-71.06, 42.31];
    } catch (error) {
      console.error("Error calculating centroid:", error);
      return [-71.06, 42.31];
    }
  }
  
  // Update the legend
  function updateLegend(investorType) {
    if (!legend) return;
    
    const investorTitle = investorType.charAt(0).toUpperCase() + investorType.slice(1);
    
    legend.innerHTML = `
      <div class="legend-title">${investorTitle} Investors</div>
      <div class="legend-scale">
        <div class="legend-item">
          <div class="legend-color" style="background-color: #fae8ee;"></div>
          <div class="legend-label">Low</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #f8d0db;"></div>
          <div class="legend-label"></div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #EEB0C2;"></div>
          <div class="legend-label"></div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #d4899e;"></div>
          <div class="legend-label"></div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #c06c84;"></div>
          <div class="legend-label">High</div>
        </div>
      </div>
      <div class="legend-title">Eviction Rate (${year})</div>
      <div class="legend-circles">
        <div class="legend-circle-item">
          <div class="legend-circle" style="width: 10px; height: 10px;"></div>
          <div class="legend-label">Low</div>
        </div>
        <div class="legend-circle-item">
          <div class="legend-circle" style="width: 15px; height: 15px;"></div>
          <div class="legend-label"></div>
        </div>
        <div class="legend-circle-item">
          <div class="legend-circle" style="width: 20px; height: 20px;"></div>
          <div class="legend-label"></div>
        </div>
        <div class="legend-circle-item">
          <div class="legend-circle" style="width: 25px; height: 25px;"></div>
          <div class="legend-label">High</div>
        </div>
      </div>
    `;
  }
  
  // Toggle layer visibility
  function toggleLayer(layer) {
    visibleLayers.update(current => ({
      ...current,
      [layer]: !current[layer]
    }));
  }
</script>

<section id="city-section" class="section">
  <div class="section-header">
    <h2>Boston City-Wide Analysis</h2>
    <p>Explore investor ownership and eviction patterns across the entire city of Boston.</p>
  </div>
  
  <div class="filter-controls">
    <div class="filter-group">
      <h3>Investor Types</h3>
      <div class="filter-buttons">
        <button class:active={$visibleLayers.institutional} on:click={() => toggleLayer('institutional')}>
          Institutional
        </button>
        <button class:active={$visibleLayers.large} on:click={() => toggleLayer('large')}>
          Large
        </button>
        <button class:active={$visibleLayers.medium} on:click={() => toggleLayer('medium')}>
          Medium
        </button>
        <button class:active={$visibleLayers.small} on:click={() => toggleLayer('small')}>
          Small
        </button>
      </div>
    </div>
    
    <div class="filter-group">
      <h3>Layers</h3>
      <div class="filter-buttons">
        <button class:active={$visibleLayers.evictions} on:click={() => toggleLayer('evictions')}>
          Eviction Rates
        </button>
      </div>
    </div>
  </div>
  
  <div class="visualization-container full-width">
    <div class="map-container" bind:this={mapContainer}></div>
  </div>
  
  <div class="section-footer">
    <p>This city-wide view reveals patterns of investor ownership and eviction rates across Boston neighborhoods.</p>
    <p>Toggle between different investor types to see how their presence correlates with eviction rates in different areas.</p>
  </div>
</section>

<style>
  .map-container {
    width: 100%;
    height: 600px;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
  }
  
  .filter-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    margin-bottom: 1rem;
    justify-content: center;
  }
  
  .filter-group {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .filter-group h3 {
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
  
  .filter-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .section-footer {
    margin-top: 2rem;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
  }
  
  :global(.map-legend) {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: white;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    z-index: 1;
    font-size: 0.8rem;
    max-width: 200px;
  }
  
  :global(.legend-title) {
    font-weight: bold;
    margin-bottom: 5px;
    margin-top: 10px;
  }
  
  :global(.legend-scale) {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }
  
  :global(.legend-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-right: 5px;
  }
  
  :global(.legend-color) {
    width: 20px;
    height: 20px;
    margin-bottom: 2px;
  }
  
  :global(.legend-circles) {
    display: flex;
    align-items: flex-end;
    margin-bottom: 5px;
  }
  
  :global(.legend-circle-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-right: 10px;
  }
  
  :global(.legend-circle) {
    border-radius: 50%;
    background-color: black;
    opacity: 0.6;
  }
  
  :global(.legend-label) {
    font-size: 0.7rem;
    text-align: center;
  }
  
  :global(.mapboxgl-popup) {
    max-width: 300px;
    font-family: 'Roboto', sans-serif;
  }
  
  :global(.mapboxgl-popup-content) {
    padding: 15px;
    border-radius: 5px;
  }
  
  :global(.mapboxgl-popup-content h4) {
    margin: 0 0 10px;
    font-weight: 500;
    color: #000;
  }
  
  :global(.mapboxgl-popup-content p) {
    margin: 5px 0;
    color: #000;
  }
  
  @media (max-width: 768px) {
    .filter-controls {
      flex-direction: column;
      gap: 1rem;
    }
    
    .map-container {
      height: 400px;
    }
  }

  .visualization-container.full-width {
    width: 100%;
    /* Optionally ensure it lays out properly: */
    display: block;
  }
</style>
