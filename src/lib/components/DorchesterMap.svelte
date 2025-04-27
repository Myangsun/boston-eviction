<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { dorchesterData, boundaryData, selectedCensusTracts, selectedInvestorType, selectedYear, dataScales, neighborhoodsData, hoveredCensusTract } from '$lib/stores.js';
  import { getMapboxToken } from '$lib/mapboxConfig.js';
  import * as turf from '@turf/turf';
  
  let mapContainer;
  let map;
  let legend;
  
  // Subscribe to store values
  let investorType;
  let year;
  let tracts = [];
  let boundaries = {};
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  let neighborhoods = {};
  const bostonBounds = [
    [-71.2, 42.2], // Southwest coordinates
    [-70.9, 42.4]  // Northeast coordinates
  ];

  // Function to update the fill opacity based on selected tracts
  function updateFillOpacity(selected) {
  try {
    map.setPaintProperty('dorchester-fill', 'fill-opacity', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      1, // Opacity for selected tracts (slightly adjusted for better visibility)
       0.3  // Lower opacity for non-selected tracts
    ]);

    // Increase selected outline width so outer borders look thicker
    map.setPaintProperty('dorchester-outline', 'line-width', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      1.5, // Thicker outline for selected tracts
      0.5  // Thinner outline for non-selected tracts
    ]);
    
    // Update line color for better visibility of selected tracts
    map.setPaintProperty('dorchester-outline', 'line-color', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      '#000000', // Black outline for selected tracts
      '#555555'  // Gray outline for non-selected tracts
    ]);
  } catch (error) {
    console.error("Error updating fill opacity:", error);
  }
}

  // Function to select Dorchester census tracts
  function selectDorchesterTracts() {
    // Check if all required data is available
    if (!$neighborhoodsData || !$dorchesterData || !$boundaryData || 
        !$boundaryData.features || $boundaryData.features.length === 0) {
      console.log("Waiting for all data to load...");
      console.log("Neighborhoods data:", $neighborhoodsData ? "Loaded" : "Not loaded");
      console.log("Dorchester data:", $dorchesterData ? "Loaded" : "Not loaded");
      console.log("Boundary data:", $boundaryData ? 
                  ($boundaryData.features ? `Loaded with ${$boundaryData.features.length} features` : "Loaded but no features") 
                  : "Not loaded");
      return;
    }
    
    try {
      console.log("Finding Dorchester tracts...");
      console.log("Boundary data features:", $boundaryData.features.length);
      
      // Find Dorchester feature in neighborhoods data
      const dorchesterFeature = $neighborhoodsData.features.find(
        f => f.properties.blockgr2020_ctr_neighb_name === 'Dorchester' || 
             f.properties.name === 'Dorchester'
      );
      
      if (!dorchesterFeature) {
        console.error("Dorchester boundary not found in neighborhoods data");
        return;
      }
      
      // Create a Turf polygon for Dorchester
      let dorchesterPolygon;
      
      // Handle both single polygon and multipolygon cases
      if (dorchesterFeature.geometry.type === 'Polygon') {
        dorchesterPolygon = turf.polygon(dorchesterFeature.geometry.coordinates);
      } else if (dorchesterFeature.geometry.type === 'MultiPolygon') {
        // For MultiPolygon, we'll just use the first polygon for simplicity
        dorchesterPolygon = turf.polygon(dorchesterFeature.geometry.coordinates[0]);
      } else {
        console.error("Unsupported geometry type:", dorchesterFeature.geometry.type);
        return;
      }
      
      // Find all census tracts that are within Dorchester
      const dorchesterTracts = [];
      
      // Check each tract
      $dorchesterData.forEach(tract => {
        // Get tract ID - handle different property names
        const tractId = tract.tract_id || tract.GEOID || tract.geoid;
        
        if (!tractId) {
          console.warn("Tract missing ID:", tract);
          return; // Skip this tract
        }
        
        // Find the corresponding boundary feature
        const boundaryFeature = $boundaryData.features.find(
          f => f.properties.GEOID === tractId || 
               f.properties.geoid === tractId || 
               f.properties.tract_id === tractId
        );
        
        if (!boundaryFeature) {
          console.warn(`No boundary found for tract: ${tractId}`);
          return; // Skip this tract
        }
        
        try {
          // Calculate centroid of the tract
          const centroid = turf.centroid(boundaryFeature);
          
          // Check if the centroid is within Dorchester
          if (centroid && turf.booleanPointInPolygon(centroid, dorchesterPolygon)) {
            dorchesterTracts.push(tractId);
          }
        } catch (err) {
          console.error(`Error processing tract ${tractId}:`, err);
        }
      });
      
      console.log(`Found ${dorchesterTracts.length} tracts within Dorchester`);
      
      // Set the selected census tracts
      if (dorchesterTracts.length > 0) {
        selectedCensusTracts.set(dorchesterTracts);
      }
    } catch (error) {
      console.error("Error selecting Dorchester tracts:", error);
    }
  }

  // Modify the reactive statement to ensure all data is available
  // $: if ($neighborhoodsData && $dorchesterData && $boundaryData && 
  //        $boundaryData.features && $boundaryData.features.length > 0) {
  //   console.log("All data is loaded, selecting Dorchester tracts");
    
  // }

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
    if (tracts.length > 0 && $neighborhoodsData && Object.keys($neighborhoodsData).length > 0) {
      // When tract data is loaded, try to select Dorchester tracts
      selectDorchesterTracts();
    }
  });
  
  const unsubscribeBoundaryData = boundaryData.subscribe(value => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  
  
  // // Add a specific subscription for selectedCensusTracts
  const unsubscribeSelectedCensusTracts = selectedCensusTracts.subscribe(selected => {
  // When selected tracts change, update the layer opacity
  if (map && map.getLayer('dorchester-fill')) {
    updateFillOpacity(selected);
  }
});
  const unsubscribeDataScales = dataScales.subscribe(value => {
    scales = value;
    if (map) updateMapLayers();
  });

  const unsubscribeNeighborhoodsData = neighborhoodsData.subscribe(value => {
    neighborhoods = value;
    if (map) updateMapLayers();
    if (value && Object.keys(value).length > 0 && map) {
      // When neighborhoods data is loaded, try to select Dorchester tracts
      selectDorchesterTracts();
    }
  });
  
  // Add subscription to hoveredCensusTract for highlighting
  const unsubscribeHoveredTract = hoveredCensusTract.subscribe(tractId => {
    if (map && map.isStyleLoaded()) {
      highlightHoveredTract(tractId);
    }
  });
  
  // Initialize map on component mount
  onMount(async () => {
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
        zoom: 14, // fixed zoom level
        minZoom: 10,
        maxZoom: 18,
        maxBounds: bostonBounds, 
        interactive: false // disable all interactions
      });
      
      console.log("Map initialized");
      
      // Create legend
      legend = document.createElement('div');
      legend.className = 'map-legend';
      mapContainer.appendChild(legend);
      
      map.on('load', async () => {
        
        
        // console.log("Neighborhoods data loaded:", neighborhoodsData);
        
        // Add sources and layers once map is loaded
        console.log("Map loaded event fired");
        initializeMapLayers();
        updateFillOpacity($selectedCensusTracts);
        selectDorchesterTracts();
        
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
      // unsubscribeSelectedTracts();
      unsubscribeDataScales();
      unsubscribeNeighborhoodsData();
      unsubscribeSelectedCensusTracts();
      unsubscribeHoveredTract();

      if (map) map.remove();
      if (legend && legend.parentNode) {
        legend.parentNode.removeChild(legend);
      }
    };
  });
  
  // Initialize map layers
  function initializeMapLayers() {
    try {
      // // Load Boston neighborhoods GeoJSON
      // const response = await fetch('/data/Boston_Neighborhoods.geojson');
      // const neighborhoodsData = await response.json();

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
            
            'fill-outline-color': '#555'
          },
          filter: ['==', '$type', 'Polygon']
        });
        
        // Update outline layer: add line-join to smooth shared borders
        map.addLayer({
          id: 'dorchester-outline',
          type: 'line',
          source: 'dorchester-data',
          layout: {
            'line-join': 'round' // Smooth joins for overlapping boundaries
          },
          paint: {
            'line-color': '#333',
            'line-width': .5
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
            'line-width': 3
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
      console.log("Neighborhoods data:", neighborhoods);
      // Only add if not already added
      if (!map.getSource('boston-neighborhoods')) {
        map.addSource('boston-neighborhoods', {
          type: 'geojson',
          data: neighborhoods
        });
      }

      // Add the Dorchester border if not already present
      if (!map.getLayer('dorchester-border')) {
        map.addLayer({
          id: 'dorchester-border',
          type: 'line',
          source: 'boston-neighborhoods',
          paint: {
            'line-color': '#a04e62', // Black border color
            'line-width': 5         // Thicker border
          },
          filter: ['==', 'blockgr2020_ctr_neighb_name', 'Dorchester'] // Ensure this matches the GeoJSON property
        }, 'dorchester-fill'); // Place above the fill layer

        // Center the map on Dorchester with padding
        const dorchesterFeature = neighborhoods.features.find(
          f => f.properties.blockgr2020_ctr_neighb_name === 'Dorchester'
        );

        if (dorchesterFeature) {
          const dorchesterBounds = turf.bbox(dorchesterFeature); // Get bounding box for Dorchester
          map.fitBounds(dorchesterBounds, {
            padding: 50, // Add padding around the bounds
            duration: 1000 // Smooth animation duration in milliseconds
          });
       }
      // Add a label layer for the text "Dorchester"
      if (!map.getLayer('dorchester-label')) {
        map.addLayer({
          id: 'dorchester-label',
          type: 'symbol',
          source: 'boston-neighborhoods',
          layout: {
            'text-field': 'Dorchester', // Static text
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 16,            // Font size
            'text-anchor': 'center'     // Center the text
          },
          paint: {
            'text-color': '#000000',    // Black text color
            'text-halo-color': '#FFFFFF', // White halo for better visibility
            'text-halo-width': 2
          },
          filter: ['==', 'blockgr2020_ctr_neighb_name', 'Dorchester'] // Ensure this matches the GeoJSON property
        });
      }
}
      
      // Add a layer for the pulsing effect (will be filtered to show only when needed)
      if (!map.getLayer('hovered-tract-pulse')) {
        map.addLayer({
          id: 'hovered-tract-pulse',
          type: 'line',
          source: 'dorchester-data',
          paint: {
            'line-color': '#D81B60',
            'line-width': 4,
            'line-opacity': 0.8
          },
          filter: ['==', 'tract_id', ''] // Initially empty filter
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
      
      // Instead of fitting bounds dynamically, keep the map fixed at Dorchester coordinates.
      map.setCenter([-71.053, 42.300]);
      map.setZoom(12);
      
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

  // Function to highlight hovered tract from scatter plot
  function highlightHoveredTract(tractId) {
    try {
      if (!map || !map.getLayer('dorchester-fill')) return;
      
      if (tractId) {
        // Do NOT change the fill opacity - maintain what's set by updateFillOpacity
        
        // Make the hovered tract's border thicker and same color as Dorchester boundary
        map.setPaintProperty('dorchester-outline', 'line-width', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          3,      // Much thicker for hovered
          ['in', ['get', 'tract_id'], ['literal', $selectedCensusTracts]],
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('dorchester-outline', 'line-color', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          '#a04e62', // Match the Dorchester boundary color
          ['in', ['get', 'tract_id'], ['literal', $selectedCensusTracts]],
          '#000000', // Black outline for selected tracts
          '#555555'  // Gray outline for non-selected tracts
        ]);
        
        // Update the pulsing outline effect
        if (map.getLayer('hovered-tract-pulse')) {
          map.setFilter('hovered-tract-pulse', ['==', ['get', 'tract_id'], tractId]);
          map.setPaintProperty('hovered-tract-pulse', 'line-color', '#a04e62');
          map.setPaintProperty('hovered-tract-pulse', 'line-width', 4);
        }
      } else {
        // When nothing is hovered, go back to normal border style only
        map.setPaintProperty('dorchester-outline', 'line-width', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $selectedCensusTracts]],
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('dorchester-outline', 'line-color', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $selectedCensusTracts]],
          '#000000', // Black outline for selected tracts
          '#555555'  // Gray outline for non-selected tracts
        ]);
        
        // Remove pulse effect
        if (map.getLayer('hovered-tract-pulse')) {
          map.setFilter('hovered-tract-pulse', ['==', 'tract_id', '']);
        }
      }
    } catch (error) {
      console.error("Error highlighting hovered tract:", error);
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
