<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { dorchesterData, boundaryData, selectedCensusTracts, selectedFlipindex, selectedYear, dataScales, neighborhoodsData } from '$lib/stores.js';
  import { getMapboxToken } from '$lib/mapboxConfig.js';
  import * as turf from '@turf/turf';
  
  let mapContainer;
  let map;
  let legend;
  
  // Subscribe to store values
  let Flipindex;
  let year;
  let tracts = [];
  let boundaries = {};
  let scales = { maxFlipindex: 0, maxEvictionRate: 0 };
  let neighborhoods = {};
  const bostonBounds = [
    [-71.2, 42.2], // Southwest coordinates
    [-70.9, 42.4]  // Northeast coordinates
  ];

  // Function to update the fill opacity based on selected tracts
  function updateFillOpacity(selected) {
  try {
    map.setPaintProperty('backbay-fill', 'fill-opacity', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      1, // Opacity for selected tracts (slightly adjusted for better visibility)
      0  // Lower opacity for non-selected tracts
    ]);

    // Update line width for tract outlines
    map.setPaintProperty('backbay-outline', 'line-width', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      1, // Thicker line for selected tracts
      0.5  // Thinner line for non-selected tracts
    ]);
    
    // Update line color for better visibility of selected tracts
    map.setPaintProperty('backbay-outline', 'line-color', [
      'case',
      ['in', ['get', 'tract_id'], ['literal', selected]],
      '#000000', // Black outline for selected tracts
      '#555555'  // Gray outline for non-selected tracts
    ]);
  } catch (error) {
    console.error("Error updating fill opacity:", error);
  }
}

  // Function to select Backbay census tracts
  function selectbackbayTracts() {
    // Check if all required data is available
    if (!$neighborhoodsData || !$dorchesterData || !$boundaryData || 
        !$boundaryData.features || $boundaryData.features.length === 0) {
      console.log("Waiting for all data to load...");
      console.log("Neighborhoods data:", $neighborhoodsData ? "Loaded" : "Not loaded");
      console.log("Backbay data:", $dorchesterData ? "Loaded" : "Not loaded");
      console.log("Boundary data:", $boundaryData ? 
                  ($boundaryData.features ? `Loaded with ${$boundaryData.features.length} features` : "Loaded but no features") 
                  : "Not loaded");
      return;
    }
    
    try {
      console.log("Finding Backbay tracts...");
      console.log("Boundary data features:", $boundaryData.features.length);
      
      // Find backbay feature in neighborhoods data
      const backbayFeature = $neighborhoodsData.features.find(
        f => f.properties.blockgr2020_ctr_neighb_name === 'Back Bay' || 
             f.properties.name === 'Back Bay'
      );
      
      if (!backbayFeature) {
        console.error("backbay boundary not found in neighborhoods data");
        return;
      }
      
      // Create a Turf polygon for backbay
      let backbayPolygon;
      
      // Handle both single polygon and multipolygon cases
      if (backbayFeature.geometry.type === 'Polygon') {
        backbayPolygon = turf.polygon(backbayFeature.geometry.coordinates);
      } else if (backbayFeature.geometry.type === 'MultiPolygon') {
        // For MultiPolygon, we'll just use the first polygon for simplicity
        backbayPolygon = turf.polygon(backbayFeature.geometry.coordinates[0]);
      } else {
        console.error("Unsupported geometry type:", backbayFeature.geometry.type);
        return;
      }
      
      // Find all census tracts that are within backbay
      const backbayTracts = [];
      
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
          
          // Check if the centroid is within backbay
          if (centroid && turf.booleanPointInPolygon(centroid, backbayPolygon)) {
            backbayTracts.push(tractId);
          }
        } catch (err) {
          console.error(`Error processing tract ${tractId}:`, err);
        }
      });
      
      console.log(`Found ${backbayTracts.length} tracts within backbay`);
      
      // Set the selected census tracts
      if (backbayTracts.length > 0) {
        selectedCensusTracts.set(backbayTracts);
      }
    } catch (error) {
      console.error("Error selecting backbay tracts:", error);
    }
  }

  // Modify the reactive statement to ensure all data is available
  // $: if ($neighborhoodsData && $dorchesterData && $boundaryData && 
  //        $boundaryData.features && $boundaryData.features.length > 0) {
  //   console.log("All data is loaded, selecting backbay tracts");
    
  // }

  const unsubscribeFlipindex = selectedFlipindex.subscribe(value => {
    Flipindex = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribedorchesterData = dorchesterData.subscribe(value => {
    tracts = value;
    if (map) updateMapLayers();
    if (tracts.length > 0 && $neighborhoodsData && Object.keys($neighborhoodsData).length > 0) {
      // When tract data is loaded, try to select backbay tracts
      selectbackbayTracts();
    }
  });
  
  const unsubscribeBoundaryData = boundaryData.subscribe(value => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  
  // const unsubscribeSelectedTracts = selectedCensusTracts.subscribe(value => {
  //   if (map) updateSelectedTracts(value);
  // });
  
  // // Add a specific subscription for selectedCensusTracts
  const unsubscribeSelectedCensusTracts = selectedCensusTracts.subscribe(selected => {
  // When selected tracts change, update the layer opacity
  if (map && map.getLayer('backbay-fill')) {
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
      // When neighborhoods data is loaded, try to select backbay tracts
      selectbackbayTracts();
    }
  });
  
  // Initialize map on component mount
  onMount(async () => {
    console.log("backbayMap component mounted");
    
    try {
      // Get Mapbox token from config
      const mapboxToken = getMapboxToken();
      mapboxgl.accessToken = mapboxToken;
      console.log("Mapbox token set:", mapboxToken);
      
      map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.0550, 42.3167], // backbay approximate center
        // zoom: 14,
        minZoom: 10,
        maxZoom: 18,
        maxBounds: bostonBounds, 
        interactive: true // Enable map interactions
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
        selectbackbayTracts();
        
        // Add click handler for census tracts
        map.on('click', 'backbay-fill', (e) => {
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
        map.on('mouseenter', 'backbay-fill', (e) => {
          if (e.features.length > 0) {
            const feature = e.features[0];
            const tractId = feature.properties.tract_id;
            const indexValue = feature.properties.index_value;
            const evictionRate = feature.properties.eviction_rate;
            
            // Format value based on index type
            let formattedValue = '';
            if (Flipindex === 'median_rent') {
              formattedValue = `$${indexValue.toLocaleString()}`;
            } else if (Flipindex === 'median_price_diff') {
              formattedValue = `$${indexValue.toLocaleString()}`;
            }
            
            // Create popup
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <h4>Census Tract</h4>
                <p>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}: ${formattedValue}</p>
                <p>Eviction Rate (${year}): ${(evictionRate * 100).toFixed(1)}%</p>
              `)
              .addTo(map);
          }
          
          map.getCanvas().style.cursor = 'pointer';
        });
        
        map.on('mouseleave', 'backbay-fill', () => {
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
      unsubscribeFlipindex();
      unsubscribeYear();
      unsubscribedorchesterData();
      unsubscribeBoundaryData();
      // unsubscribeSelectedTracts();
      unsubscribeDataScales();
      unsubscribeNeighborhoodsData();
      unsubscribeSelectedCensusTracts();

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
      if (!map.getSource('backbay-data')) {
        // Add source for census tracts
        map.addSource('backbay-data', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
         
        
        // Add fill layer for choropleth - updated colors to match new theme
        map.addLayer({
          id: 'backbay-fill',
          type: 'fill',
          source: 'backbay-data',
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
        
        // Add outline layer
        map.addLayer({
          id: 'backbay-outline',
          type: 'line',
          source: 'backbay-data',
          paint: {
            'line-color': '#333',
            'line-width': .5
          },
          filter: ['==', '$type', 'Polygon']
        });
        
        // Add selected outline layer
        map.addLayer({
          id: 'backbay-selected',
          type: 'line',
          source: 'backbay-data',
          paint: {
            'line-color': '#000',
            'line-width': 3
          },
          filter: ['all', ['==', '$type', 'Polygon'], ['in', 'tract_id', '']]
        });

              
        // Add eviction circles layer
        map.addLayer({
          id: 'backbay-evictions',
          type: 'circle',
          source: 'backbay-data',
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

      // Add the backbay border if not already present
      if (!map.getLayer('backbay-border')) {
        map.addLayer({
          id: 'backbay-border',
          type: 'line',
          source: 'boston-neighborhoods',
          paint: {
            'line-color': '#000000', // Black border color
            'line-width': 5         // Thicker border
          },
          filter: ['==', 'blockgr2020_ctr_neighb_name', 'Back Bay'] // Ensure this matches the GeoJSON property
        }, 'backbay-fill'); // Place above the fill layer

        // Center the map on backbay with padding
        const backbayFeature = neighborhoods.features.find(
          f => f.properties.blockgr2020_ctr_neighb_name === 'Back Bay'
        );

        if (backbayFeature) {
          const backbayBounds = turf.bbox(backbayFeature); // Get bounding box for backbay
          map.fitBounds(backbayBounds, {
            padding: 50, // Add padding around the bounds
            duration: 1000 // Smooth animation duration in milliseconds
          });
       }
      // Add a label layer for the text "backbay"
      if (!map.getLayer('backbay-label')) {
        map.addLayer({
          id: 'backbay-label',
          type: 'symbol',
          source: 'boston-neighborhoods',
          layout: {
            'text-field': 'backbay', // Static text
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 16,            // Font size
            'text-anchor': 'center'     // Center the text
          },
          paint: {
            'text-color': '#000000',    // Black text color
            'text-halo-color': '#FFFFFF', // White halo for better visibility
            'text-halo-width': 2
          },
          filter: ['==', 'blockgr2020_ctr_neighb_name', 'backbay'] // Ensure this matches the GeoJSON property
        });
      }
}
      

      
      updateMapLayers();
    } catch (error) {
      console.error("Error initializing map layers:", error);
    }
  }
  
  // Update map layers based on current data and selections
  function updateMapLayers() {

    try {
      if (!map || !map.getSource('backbay-data')) {
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
          
          // Get the value based on the selected index
          let indexValue = 0;
          if (Flipindex === 'median_rent') {
            indexValue = +tract[`median_rent`];
          } else if (Flipindex === 'median_price_diff') {
            indexValue = +tract[`median_price_diff`];
          }

          // Add point feature for eviction circle
          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: centroid
            },
            properties: {
              tract_id: tract.GEOID,
              index_value: indexValue,
              eviction_rate: +tract[`eviction_rate_${year}`] || 0
            }
          });
          
          // Add polygon feature for fill
          features.push({
            type: 'Feature',
            geometry: boundaryFeature.geometry,
            properties: {
              tract_id: tract.GEOID,
              index_value: indexValue,
              eviction_rate: +tract[`eviction_rate_${year}`] || 0
            }
          });
        }
      });
      
      console.log("Created features:", features.length);
      
      // Update source data
      map.getSource('backbay-data').setData({
        type: 'FeatureCollection',
        features
      });

      // Update fill layer color scale based on the selected index and its range
      if (Flipindex === 'median_rent') {
        // Scale for median rent (assuming different range)
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          400, '#fae8ee',
          1000, '#f8d0db',
          2000, '#EEB0C2', 
          3000, '#d4899e',
          3500, '#c06c84'
        ]);
      } else if (Flipindex === 'median_price_diff') {
        // Scale for median price difference (different range)
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          -50000, '#fae8ee',
          0, '#f8d0db',
          50000, '#EEB0C2',
          100000, '#d4899e',
          135000, '#c06c84'
        ]);
      }
      
      // Update fill layer color scale based on the selected index
      if (Flipindex === 'median_rent') {
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          scales.minMedianRent || 400, '#fae8ee',
          1000, '#f8d0db',
          2000, '#EEB0C2', 
          3000, '#d4899e',
          scales.maxMedianRent || 3500, '#c06c84'
        ]);
      } else if (Flipindex === 'median_price_diff') {
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          scales.minMedianPriceDiff || -50000, '#fae8ee',
          0, '#f8d0db',
          50000, '#EEB0C2',
          100000, '#d4899e',
          scales.maxMedianPriceDiff || 135000, '#c06c84'
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
    
    if (!legend) return;
  
    let legendTitle = '';
    let colorScaleLabels = [];
    
    if (Flipindex === 'median_rent') {
    legendTitle = 'Median Rent';
    colorScaleLabels = ['$400', '$1,000', '$2,000', '$3,000', '$3,500+'];
  } else if (Flipindex === 'median_price_diff') {
    legendTitle = 'Median Price Difference';
    colorScaleLabels = ['-$50,000', '$0', '$50,000', '$100,000', '$135,000+'];
  }
    
    legend.innerHTML = `
      <div class="legend-title">${legendTitle} Investors</div>
      <div class="legend-scale">
        <div class="legend-item">
          <div class="legend-color" style="background-color: #fae8ee;"></div>
          <div class="legend-label">${colorScaleLabels[0]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #f8d0db;"></div>
          <div class="legend-label">${colorScaleLabels[1]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #EEB0C2;"></div>
          <div class="legend-label">${colorScaleLabels[2]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #d4899e;"></div>
          <div class="legend-label">${colorScaleLabels[3]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #c06c84;"></div>
          <div class="legend-label">${colorScaleLabels[4]}</div>
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
      if (!map || !map.getLayer('backbay-selected')) {
        return;
      }
      
      // Update filter for selected tracts
      map.setFilter('backbay-selected', ['all', ['==', '$type', 'Polygon'], ['in', 'tract_id', ...selected]]);
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
