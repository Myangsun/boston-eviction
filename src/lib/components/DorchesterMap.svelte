<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { dorchesterData, boundaryData, selectedCensusTracts, selectedInvestorType, selectedYear, dataScales } from '$lib/stores.js';
  import { getMapboxToken } from '$lib/mapboxConfig.js';
  
  let mapContainer;
  let map;
  let legend;
  
  // Subscribe to store values
  let investorType;
  let year;
  let tracts = [];
  let boundaries = {};
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  
  const unsubscribeInvestorType = selectedInvestorType.subscribe(value => {
    investorType = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeDorchesterData = dorchesterData.subscribe(value => {
    tracts = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeBoundaryData = boundaryData.subscribe(value => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeSelectedTracts = selectedCensusTracts.subscribe(value => {
    if (map) updateSelectedTracts(value);
  });
  
  const unsubscribeDataScales = dataScales.subscribe(value => {
    scales = value;
    if (map) updateMapLayers();
  });
  
  // Initialize map on component mount
  onMount(() => {
    console.log("DorchesterMap component mounted");
    
    try {
      // Get Mapbox token from config
      const mapboxToken = getMapboxToken();
      mapboxgl.accessToken = mapboxToken;
      console.log("Mapbox token set:", mapboxToken);
      
      map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.0550, 42.3167], // Dorchester approximate center
        zoom: 14,
        minZoom: 13,
        maxZoom: 17,
        interactive: true // Enable map interactions
      });
      
      console.log("Map initialized");
      
      // Create legend
      legend = document.createElement('div');
      legend.className = 'map-legend';
      mapContainer.appendChild(legend);
      
      map.on('load', () => {
        console.log("Map loaded event fired");
        // Add sources and layers once map is loaded
        initializeMapLayers();
        
        // Add click handler for census tracts
        map.on('click', 'dorchester-fill', (e) => {
          if (e.features.length > 0) {
            const tractId = e.features[0].properties.tract_id;
            
            // Update selected census tracts
            selectedCensusTracts.update(selected => {
              if (selected.includes(tractId)) {
                return selected.filter(id => id !== tractId);
              } else {
                return [...selected, tractId];
              }
            });
          }
        });
        
        // Add popup on hover
        map.on('mouseenter', 'dorchester-fill', (e) => {
          if (e.features.length > 0) {
            const feature = e.features[0];
            const tractId = feature.properties.tract_id;
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
        
        map.on('mouseleave', 'dorchester-fill', () => {
          map.getCanvas().style.cursor = '';
          const popups = document.getElementsByClassName('mapboxgl-popup');
          if (popups.length) {
            popups[0].remove();
          }
        });
      });
      
      map.on('error', (e) => {
        console.error("Map error:", e);
      });
    } catch (error) {
      console.error("Error initializing map:", error);
    }
    
    // Cleanup on component destroy
    return () => {
      unsubscribeInvestorType();
      unsubscribeYear();
      unsubscribeDorchesterData();
      unsubscribeBoundaryData();
      unsubscribeSelectedTracts();
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
      console.log("Initializing map layers");
      if (!map.getSource('dorchester-data')) {
        // Add source for census tracts
        map.addSource('dorchester-data', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
        
        // Add fill layer for choropleth - updated colors to match new theme
        map.addLayer({
          id: 'dorchester-fill',
          type: 'fill',
          source: 'dorchester-data',
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
          filter: ['==', '$type', 'Polygon']
        });
        
        // Add outline layer
        map.addLayer({
          id: 'dorchester-outline',
          type: 'line',
          source: 'dorchester-data',
          paint: {
            'line-color': '#333',
            'line-width': 1
          },
          filter: ['==', '$type', 'Polygon']
        });
        
        // Add selected outline layer
        map.addLayer({
          id: 'dorchester-selected',
          type: 'line',
          source: 'dorchester-data',
          paint: {
            'line-color': '#000',
            'line-width': 1
          },
          filter: ['all', ['==', '$type', 'Polygon'], ['in', 'tract_id', '']]
        });
        
        // Add eviction circles layer
        map.addLayer({
          id: 'dorchester-evictions',
          type: 'circle',
          source: 'dorchester-data',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'eviction_rate'],
              0, 2,
              0.05, 4,
              0.1, 6,
              0.2, 8
            ],
            'circle-color': 'black',
            'circle-opacity': 0.6
          },
          layout: {
            'visibility': 'visible' // Ensure circles are visible by default
          },
          filter: ['==', '$type', 'Point']
        });
      }
      
      updateMapLayers();
    } catch (error) {
      console.error("Error initializing map layers:", error);
    }
  }
  
  // Update map layers based on current data and selections
  function updateMapLayers() {
    try {
      if (!map || !map.getSource('dorchester-data')) {
        console.log("Cannot update map layers yet - map source not ready");
        return;
      }
      
      if (!tracts || !tracts.length) {
        console.log("Cannot update map layers yet - no tract data available");
        return;
      }
      
      if (!boundaries || !boundaries.features) {
        console.log("Cannot update map layers yet - no boundary data available");
        return;
      }
      
      console.log("Updating map layers with data");
      console.log("Tracts:", tracts.length);
      console.log("Boundaries features:", boundaries.features?.length);
      
      // Create GeoJSON features from tract data by joining with boundary data
      const features = [];
      
      // Loop through all census tracts in the data
      tracts.forEach(tract => {
        // Find corresponding boundary feature in the GeoJSON
        const boundaryFeature = boundaries.features?.find(f => 
          f.properties.geoid === tract.GEOID
        );
        
        if (boundaryFeature) {
          // Calculate centroid for the eviction circle
          let centroid = calculateCentroid(boundaryFeature.geometry);
          
          // Add point feature for eviction circle
          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: centroid
            },
            properties: {
              tract_id: tract.GEOID,
              investor_count: +tract[`sum_${investorType}_investor`] || 0,
              eviction_rate: +tract[`eviction_rate_${year}`] || 0
            }
          });
          
          // Add polygon feature for fill
          features.push({
            type: 'Feature',
            geometry: boundaryFeature.geometry,
            properties: {
              tract_id: tract.GEOID,
              investor_count: +tract[`sum_${investorType}_investor`] || 0,
              eviction_rate: +tract[`eviction_rate_${year}`] || 0
            }
          });
        }
      });
      
      console.log("Created features:", features.length);
      
      // Update source data
      map.getSource('dorchester-data').setData({
        type: 'FeatureCollection',
        features
      });
      
      // Update fill layer color scale based on global max values
      if (scales.maxInvestorCount > 0) {
        map.setPaintProperty('dorchester-fill', 'fill-color', [
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
        map.setPaintProperty('dorchester-evictions', 'circle-radius', [
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
      
      // Update legend
      updateLegend();
      
      // Fit map to census tract boundaries if features exist and map is not being interacted with
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
      console.error("Error updating map layers:", error);
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
  function updateLegend() {
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
  
  // Update selected census tracts
  function updateSelectedTracts(selected) {
    try {
      if (!map || !map.getLayer('dorchester-selected')) {
        return;
      }
      
      // Update filter for selected tracts
      map.setFilter('dorchester-selected', ['all', ['==', '$type', 'Polygon'], ['in', 'tract_id', ...selected]]);
    } catch (error) {
      console.error("Error updating selected tracts:", error);
    }
  }
</script>

<div class="map-container" bind:this={mapContainer}></div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
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
</style>
