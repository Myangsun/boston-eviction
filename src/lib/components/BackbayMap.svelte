<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { dorchesterData, boundaryData, selectedCensusTracts, backbaySelectedTracts, selectedFlipindex, selectedYear, dataScales, neighborhoodsData, hoveredCensusTract } from '$lib/stores.js';
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

  // Ensure map is fully initialized before attempting to select tracts
  let mapInitialized = false;
  
  // Add a flag to track interactions initialization
  let interactionsInitialized = false;
  
  // Add a debug flag to control console output
  const DEBUG_MODE = false; // Set to true only when debugging
  
  // Function to update the fill opacity based on selected tracts
  function updateFillOpacity(selected) {
    try {
      console.log("Updating fill opacity for Back Bay tracts:", selected);
      
      // Check if map and layers are ready
      if (!map || !map.getSource('backbay-data') || !map.getLayer('backbay-fill')) {
        console.log("Map or layers not ready yet");
        return;
      }
      
      // For clarity about which tracts are being modified
      const hasSelectedTracts = selected && selected.length > 0;
      
      // Apply the fill opacity with multi-condition logic
      map.setPaintProperty('backbay-fill', 'fill-opacity', [
        'case',
        // If tract is selected, full opacity
        ['in', ['get', 'tract_id'], ['literal', selected]],
        0.9, // Highest opacity for selected tracts
        // If tract is in Back Bay, medium opacity
        ['==', ['get', 'is_backbay'], true],
        hasSelectedTracts ? 0.4 : 0.7, // Medium opacity for Back Bay tracts (lower if selections exist)
        hasSelectedTracts ? 0.1 : 0.2  // Low opacity for other tracts (lower if selections exist)
      ]);

      // Update line width with multi-condition logic
      map.setPaintProperty('backbay-outline', 'line-width', [
        'case',
        ['in', ['get', 'tract_id'], ['literal', selected]],
        1.5, // Thickest for selected tracts
        ['==', ['get', 'is_backbay'], true],
        0.5, // Normal for Back Bay tracts
        0.2  // Thinnest for other tracts
      ]);
      
      // Update line color with multi-condition logic
      map.setPaintProperty('backbay-outline', 'line-color', [
        'case',
        ['in', ['get', 'tract_id'], ['literal', selected]],
        '#000000', // Black outline for selected tracts
        ['==', ['get', 'is_backbay'], true],
        '#555555', // Dark gray for Back Bay tracts
        '#AAAAAA'  // Light gray for other tracts
      ]);
    } catch (error) {
      console.error("Error updating fill opacity:", error);
    }
  }

  // Add a safety check to make sure data is properly loaded before proceeding
  function ensureDataLoaded() {
    // Check for valid neighborhoods data
    if (!$neighborhoodsData || !$neighborhoodsData.features || !Array.isArray($neighborhoodsData.features)) {
      console.error("Neighborhoods data is not properly loaded");
      return false;
    }
    
    // Check for valid boundary data
    if (!$boundaryData || !$boundaryData.features || !Array.isArray($boundaryData.features)) {
      console.error("Boundary data is not properly loaded");
      return false;
    }
    
    // Check for valid tract data
    if (!tracts || !Array.isArray(tracts) || tracts.length === 0) {
      console.error("Tract data is not properly loaded");
      return false;
    }
    
    return true;
  }

  // Function to select Back Bay census tracts with improved tract ID matching
  function selectBackbayTracts() {
    console.log("Attempting to select Back Bay tracts");
    
    if (!ensureDataLoaded()) {
      setTimeout(() => selectBackbayTracts(), 1000);
      return;
    }
    
    // Check if all required data is available
    if (!$neighborhoodsData || !$dorchesterData || !$boundaryData || 
        !$boundaryData.features || $boundaryData.features.length === 0) {
      console.log("Waiting for all data to load...");
      console.log("Neighborhoods data:", $neighborhoodsData ? "Loaded" : "Not loaded");
      console.log("Back Bay data:", $dorchesterData ? "Loaded" : "Not loaded");
      console.log("Boundary data:", $boundaryData ? 
                  ($boundaryData.features ? `Loaded with ${$boundaryData.features.length} features` : "Loaded but no features") 
                  : "Not loaded");
      return;
    }
    
    try {
      console.log("Finding Back Bay tracts...");
      
      // Find Back Bay feature in neighborhoods data
      const backbayFeature = $neighborhoodsData.features.find(
        f => f.properties.blockgr2020_ctr_neighb_name === 'Back Bay' || 
             f.properties.name === 'Back Bay'
      );
      
      if (!backbayFeature) {
        console.error("Back Bay boundary not found in neighborhoods data");
        return;
      }
      
      // Create a Turf polygon for Back Bay
      let backbayPolygon;
      
      // Handle both single polygon and multipolygon cases
      if (backbayFeature.geometry.type === 'Polygon') {
        backbayPolygon = turf.polygon(backbayFeature.geometry.coordinates);
      } else if (backbayFeature.geometry.type === 'MultiPolygon') {
        // We need to handle MultiPolygon properly by creating a Feature collection
        const polygons = [];
        backbayFeature.geometry.coordinates.forEach((coords) => {
          polygons.push(turf.polygon(coords));
        });
        backbayPolygon = turf.featureCollection(polygons);
      } else {
        console.error("Unsupported geometry type:", backbayFeature.geometry.type);
        return;
      }
      
      // Create a map of tract IDs to boundary features for faster lookup
      const tractIdToBoundary = {};
      
      // First, build a lookup map with all possible ID formats
      $boundaryData.features.forEach(feature => {
        const props = feature.properties;
        // Store by GEOID
        if (props.GEOID) tractIdToBoundary[props.GEOID] = feature;
        if (props.geoid) tractIdToBoundary[props.geoid] = feature;
        if (props.tract_id) tractIdToBoundary[props.tract_id] = feature;
        
        // Also try with and without leading zeros for compatibility
        if (props.GEOID) {
          tractIdToBoundary[props.GEOID.replace(/^0+/, '')] = feature;
          tractIdToBoundary[`0${props.GEOID}`] = feature;
        }
      });
      
      // Find all census tracts that are within Back Bay
      const backbayTracts = [];
      const processedTracts = new Set(); // To avoid duplicates
      const missingBoundaries = new Set(); // To track missing tract boundaries
      let missingCount = 0; // Count missing boundaries
      
      // Check each tract
      $dorchesterData.forEach(tract => {
        // Get tract ID - try all known property names
        const tractId = tract.tract_id || tract.GEOID || tract.geoid;
        
        if (!tractId) {
          if (DEBUG_MODE) console.debug("Tract missing ID:", tract);
          return; // Skip this tract
        }
        
        // Avoid processing the same tract multiple times
        if (processedTracts.has(tractId)) {
          return;
        }
        processedTracts.add(tractId);
        
        // Try to find boundary with flexible matching
        const boundaryFeature = findBoundaryFeature(tractId, tractIdToBoundary);
        
        if (!boundaryFeature) {
          missingCount++;
          if (DEBUG_MODE && !missingBoundaries.has(tractId)) {
            console.warn(`No boundary found for tract: ${tractId}`);
            missingBoundaries.add(tractId); // Only log each missing tract once
          }
          return; // Skip this tract
        }
        
        try {
          // Calculate centroid of the tract
          const centroid = turf.centroid(boundaryFeature);
          
          // Check if the centroid is within any of the Back Bay polygons
          let isWithinBackBay = false;
          
          if (backbayFeature.geometry.type === 'Polygon') {
            isWithinBackBay = turf.booleanPointInPolygon(centroid, backbayPolygon);
          } else if (backbayFeature.geometry.type === 'MultiPolygon') {
            // Check against each polygon in the MultiPolygon
            backbayFeature.geometry.coordinates.forEach(coords => {
              const poly = turf.polygon(coords);
              if (turf.booleanPointInPolygon(centroid, poly)) {
                isWithinBackBay = true;
              }
            });
          }
          
          if (isWithinBackBay) {
            backbayTracts.push(tractId);
          }
        } catch (err) {
          console.error(`Error processing tract ${tractId}:`, err);
        }
      });
      
      // Log a summary instead of individual messages
      if (missingCount > 0 && !DEBUG_MODE) {
        console.info(`${missingCount} census tracts were skipped due to missing boundary data.`);
      }
      
      console.log(`Found ${backbayTracts.length} tracts within Back Bay`);
      
      // Set the selected census tracts specifically for Back Bay
      if (backbayTracts.length > 0) {
        console.log("Setting Back Bay selected census tracts to:", backbayTracts);
        
        // IMPORTANT: Clear current selections first, then set new ones
        backbaySelectedTracts.set([]);
        setTimeout(() => {
          backbaySelectedTracts.set(backbayTracts);
          
          // Apply the selection immediately to the map
          if (map && map.isStyleLoaded() && map.getLayer('backbay-fill')) {
            updateFillOpacity(backbayTracts);
          }
        }, 50);
      }
    } catch (error) {
      console.error("Error selecting Back Bay tracts:", error);
    }
  }

  // Helper function to find boundary feature with flexible ID matching
  function findBoundaryFeature(tractId, tractIdMap) {
    // Direct lookup first
    if (tractIdMap[tractId]) {
      return tractIdMap[tractId];
    }
    
    // Try with/without leading zeros
    const withoutLeadingZeros = tractId.replace(/^0+/, '');
    if (tractIdMap[withoutLeadingZeros]) {
      return tractIdMap[withoutLeadingZeros];
    }
    
    const withLeadingZero = `0${tractId}`;
    if (tractIdMap[withLeadingZero]) {
      return tractIdMap[withLeadingZero];
    }
    
    // Try traditional lookup if map lookup fails
    return $boundaryData.features?.find(f => {
      const boundaryId = f.properties.GEOID || f.properties.geoid || f.properties.tract_id;
      return boundaryId === tractId || 
             boundaryId === withoutLeadingZeros ||
             boundaryId === withLeadingZero;
    });
  }

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
      // Standardize to use selectBackbayTracts not selectbackbayTracts
      selectBackbayTracts();
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
  const unsubscribeSelectedCensusTracts = backbaySelectedTracts.subscribe(selected => {
  // When selected tracts change, update the layer opacity
  if (map && map.getLayer('backbay-fill') && map.isStyleLoaded()) {
    console.log("Tract selection changed, updating map:", selected);
    if (selected.length === 0) {
      // If no tracts are selected, refresh the selection from the neighborhood
      selectBackbayTracts();
    } else {
      updateFillOpacity(selected);
    }
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
      // Standardize to use selectBackbayTracts not selectbackbayTracts
      selectBackbayTracts();
    }
  });

  // Add subscription to hoveredCensusTract for highlighting
  const unsubscribeHoveredTract = hoveredCensusTract.subscribe(tractId => {
    if (map && map.isStyleLoaded()) {
      try {
        highlightHoveredTract(tractId);
      } catch (error) {
        console.error("Error in hover tract subscription:", error);
      }
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
      
      // Create a single reusable popup outside of event handlers with smooth transitions
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'map-popup-smooth' // Add this class for CSS transitions
      });
      
      map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.0550, 42.3167], // backbay approximate center
        zoom: 13, // Set appropriate initial zoom level
        minZoom: 10,
        maxZoom: 18,
        maxBounds: bostonBounds, 
        interactive: true, // Ensure interactive is explicitly set to true
        attributionControl: false // Hide attribution for cleaner UI
      });
      
      // Add navigation controls to make the map more visibly interactive
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      
      console.log("Map initialized");
      
      // Create legend
      legend = document.createElement('div');
      legend.className = 'map-legend';
      mapContainer.appendChild(legend);
      
      // Force focus on map container to ensure it catches events immediately
      mapContainer.focus();
      
      // Make map interactive immediately
      map.on('style.load', () => {
        console.log("Map style loaded - setting up interactions");
        setupMapInteractions(popup);
        interactionsInitialized = true;
      });
      
      map.on('load', async () => {
        console.log("Map loaded event fired");
        
        mapInitialized = true;
        initializeMapLayers();
        
        // Standardize to use selectBackbayTracts not selectbackbayTracts
        selectBackbayTracts();
        
        if (!interactionsInitialized) {
          setupMapInteractions(popup);
          interactionsInitialized = true;
        }
        
        // Wait for a brief moment after map initialization, then try again
        setTimeout(() => {
          selectBackbayTracts();
          updateFillOpacity($selectedCensusTracts);
        }, 500);
        
        // Add click handler for census tracts
        map.on('click', 'backbay-fill', (e) => {
          if (e.features.length > 0) {
            const tractId = e.features[0].properties.tract_id;
            
            // Update Back Bay selected census tracts
            backbaySelectedTracts.update(selected => {
              if (selected.includes(tractId)) {
                return selected.filter(id => id !== tractId);
              } else {
                return [...selected, tractId];
              }
            });
          }
        });
        
        // Use a single popup instance for better performance with improved hover interaction
        map.on('mousemove', 'backbay-fill', (e) => {
          if (e.features.length > 0) {
            const feature = e.features[0];
            const tractId = feature.properties.tract_id;
            const indexValue = feature.properties.index_value;
            const evictionRate = feature.properties.eviction_rate;
            
            // Update hover state in store to sync with scatter plot
            hoveredCensusTract.set(tractId);
            map.getCanvas().style.cursor = 'pointer';
            
            // Format value based on index type
            let formattedValue = '';
            if (Flipindex === 'median_rent') {
              formattedValue = `$${indexValue.toLocaleString()}`;
            } else if (Flipindex === 'median_price_diff') {
              formattedValue = `$${indexValue.toLocaleString()}`;
            }
            
            // Update existing popup instead of creating a new one
            popup
              .setLngLat(e.lngLat)
              .setHTML(`
                <h4>Census Tract</h4>
                <p><strong>GEOID:</strong> ${tractId}</p>
                <p><strong>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}:</strong> ${formattedValue}</p>
                <p><strong>Eviction Rate (${year}):</strong> ${(evictionRate * 100).toFixed(1)}%</p>
              `)
              .addTo(map);
          }
        });
        
        map.on('mouseleave', 'backbay-fill', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
          hoveredCensusTract.set(null); // Clear hover state
        });
      });
      
      map.on('error', (e) => {
        console.error("Map error:", e);
      });
      
      // Add a direct click handler on the map container to ensure focus
      mapContainer.addEventListener('click', () => {
        mapContainer.focus();
      });
      
      // Simulate a click on the map after a short delay to ensure focus
      setTimeout(() => {
        mapContainer.click();
        mapContainer.focus();
      }, 200);
     
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
      unsubscribeHoveredTract(); // Add this line

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
      
      // Add sources and layers with error handling
      try {
        if (!map.getSource('backbay-data')) {
          map.addSource('backbay-data', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: []
            }
          });
          
          // Add fill layer for choropleth - updated colors to teal theme
          map.addLayer({
            id: 'backbay-fill',
            type: 'fill',
            source: 'backbay-data',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['get', 'index_value'],
                scales.minMedianRent || 400, '#e8faef', // Lightest teal
                1000, '#c7f3e0', // Light teal
                2000, '#88e4cc', // Medium teal
                3000, '#58cbad', // Darker teal
                scales.maxMedianRent || 3500, '#2da88a' // Darkest teal
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
      } catch (error) {
        console.error("Error adding source or layers:", error);
      }
      
      try {
        // Only add neighborhoods source if valid
        if ($neighborhoodsData && $neighborhoodsData.features && 
            !map.getSource('boston-neighborhoods')) {
          map.addSource('boston-neighborhoods', {
            type: 'geojson',
            data: $neighborhoodsData
          });
        }
      } catch (error) {
        console.error("Error adding neighborhoods source:", error);
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
            'line-color': '#2da88a', // Match darkest teal color
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
      // Add a label layer for the text "backbay" - Fix the capitalization
      if (!map.getLayer('backbay-label')) {
        map.addLayer({
          id: 'backbay-label',
          type: 'symbol',
          source: 'boston-neighborhoods',
          layout: {
            'text-field': 'Back Bay', // Fixed: Corrected capitalization 
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 16,            
            'text-anchor': 'center'     
          },
          paint: {
            'text-color': '#000000',    
            'text-halo-color': '#FFFFFF', 
            'text-halo-width': 2
          },
          filter: ['==', 'blockgr2020_ctr_neighb_name', 'Back Bay'] // Fixed: Corrected capitalization 
        });
      }
}
      
      // Add a layer for the pulsing effect on hover
      if (!map.getLayer('backbay-hovered-tract')) {
        map.addLayer({
          id: 'backbay-hovered-tract',
          type: 'line',
          source: 'backbay-data',
          paint: {
            'line-color': '#2da88a',
            'line-width': 4,
            'line-opacity': 0.8
          },
          filter: ['==', 'tract_id', '']
        });
      }

      
      updateMapLayers(false); // CHANGED: Use false to show all tracts by default
    } catch (error) {
      console.error("Error initializing map layers:", error);
    }
  }
  
  // Update map layers based on current data and selections
  function updateMapLayers(forceBackBayFilter = false) {
    try {
      if (!map || !map.getSource('backbay-data')) {
        console.log("Cannot update map layers yet - map source not ready");
        return;
      }
      
      if (!ensureDataLoaded()) {
        console.log("Waiting for data to be properly loaded");
        setTimeout(() => updateMapLayers(forceBackBayFilter), 1000);
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
      
      // Find Back Bay neighborhood for filtering
      const backbayFeature = $neighborhoodsData?.features?.find(
        f => f.properties.blockgr2020_ctr_neighb_name === 'Back Bay' || 
             f.properties.name === 'Back Bay'
      );
      
      // Create a list of Back Bay tract IDs for filtering
      const backbayTractIds = [];
      
      if (backbayFeature && $boundaryData && $boundaryData.features) {
        // For each census tract, check if its centroid is within Back Bay
        $boundaryData.features.forEach(feature => {
          try {
            const tractId = feature.properties.GEOID || 
                           feature.properties.geoid || 
                           feature.properties.tract_id;
            
            if (!tractId) return;
            
            const centroid = turf.centroid(feature);
            let isWithinBackBay = false;
            
            if (backbayFeature.geometry.type === 'Polygon') {
              isWithinBackBay = turf.booleanPointInPolygon(centroid, 
                turf.polygon(backbayFeature.geometry.coordinates));
            } else if (backbayFeature.geometry.type === 'MultiPolygon') {
              backbayFeature.geometry.coordinates.forEach(coords => {
                if (turf.booleanPointInPolygon(centroid, turf.polygon(coords))) {
                  isWithinBackBay = true;
                }
              });
            }
            
            if (isWithinBackBay) {
              backbayTractIds.push(tractId);
            }
          } catch (err) {
            // Skip this tract on error
          }
        });
      }
      
      console.log("Found Back Bay tract IDs:", backbayTractIds);
      
      // Create a map of tract IDs to boundary features for faster lookup
      const tractIdToBoundary = {};
      $boundaryData.features.forEach(feature => {
        const props = feature.properties;
        // Store by GEOID
        if (props.GEOID) tractIdToBoundary[props.GEOID] = feature;
        if (props.geoid) tractIdToBoundary[props.geoid] = feature;
        if (props.tract_id) tractIdToBoundary[props.tract_id] = feature;
        
        // Also try with and without leading zeros
        if (props.GEOID) {
          tractIdToBoundary[props.GEOID.replace(/^0+/, '')] = feature;
          tractIdToBoundary[`0${props.GEOID}`] = feature;
        }
      });
      
      // Create GeoJSON features from tract data by joining with boundary data
      const features = [];
      
      // Loop through all census tracts
      tracts.forEach(tract => {
        const tractId = tract.GEOID || tract.tract_id || tract.geoid;
        
        // Skip if forced filtering is on and this isn't a Back Bay tract
        if (forceBackBayFilter && backbayTractIds.length > 0 && !backbayTractIds.includes(tractId)) {
          return;
        }
        
        // Find boundary with flexible matching
        const boundaryFeature = findBoundaryFeature(tractId, tractIdToBoundary);
        
        // If no boundary found, simply skip this tract silently (no error logging)
        if (!boundaryFeature) {
          return;
        }
        
        // Calculate centroid for the eviction circle
        let centroid = calculateCentroid(boundaryFeature.geometry); 
        
        // Get the value based on the selected index
        let indexValue = 0;
        if (Flipindex === 'median_rent') {
          indexValue = +tract[`median_rent`];
        } else if (Flipindex === 'median_price_diff') {
          indexValue = +tract[`median_price_diff`];
        }
        
        // Mark if this tract is within Back Bay
        const isBackBay = backbayTractIds.includes(tractId);

        // Add point feature for eviction circle
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: centroid
          },
          properties: {
            tract_id: tractId,
            index_value: indexValue,
            eviction_rate: +tract[`eviction_rate_${year}`] || 0,
            is_backbay: isBackBay
          }
        });
        
        // Add polygon feature for fill
        features.push({
          type: 'Feature',
          geometry: boundaryFeature.geometry,
          properties: {
            tract_id: tractId,
            index_value: indexValue,
            eviction_rate: +tract[`eviction_rate_${year}`] || 0,
            is_backbay: isBackBay
          }
        });
      });
      
      // Additional filter for Back Bay tracts only if needed
      const filteredFeatures = forceBackBayFilter ? 
        features.filter(f => f.properties.is_backbay) : features;
      
      console.log(`Created ${filteredFeatures.length} features for Back Bay map`);
      
      // Update source data
      map.getSource('backbay-data').setData({
        type: 'FeatureCollection',
        features: filteredFeatures
      });

      // Update fill layer color scale based on the selected index and its range
      if (Flipindex === 'median_rent') {
        // Scale for median rent (assuming different range)
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          400, '#e8faef', // Lightest teal
          1000, '#c7f3e0', // Light teal
          2000, '#88e4cc', // Medium teal
          3000, '#58cbad', // Darker teal
          3500, '#2da88a' // Darkest teal
        ]);
      } else if (Flipindex === 'median_price_diff') {
        // Scale for median price difference (different range)
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          -50000, '#e8faef', // Lightest teal
          0, '#c7f3e0', // Light teal
          50000, '#88e4cc', // Medium teal
          100000, '#58cbad', // Darker teal
          135000, '#2da88a' // Darkest teal
        ]);
      }
      
      // Update fill layer color scale based on the selected index
      if (Flipindex === 'median_rent') {
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          scales.minMedianRent || 400, '#e8faef', // Lightest teal
          1000, '#c7f3e0', // Light teal
          2000, '#88e4cc', // Medium teal
          3000, '#58cbad', // Darker teal
          scales.maxMedianRent || 3500, '#2da88a' // Darkest teal
        ]);
      } else if (Flipindex === 'median_price_diff') {
        map.setPaintProperty('backbay-fill', 'fill-color', [
          'interpolate',
          ['linear'],
          ['get', 'index_value'],
          scales.minMedianPriceDiff || -50000, '#e8faef', // Lightest teal
          0, '#c7f3e0', // Light teal
          50000, '#88e4cc', // Medium teal
          100000, '#58cbad', // Darker teal
          scales.maxMedianPriceDiff || 135000, '#2da88a' // Darkest teal
        ]);
      }
      
      // Set base opacity based on neighborhood
      map.setPaintProperty('backbay-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'is_backbay'], true],
        0.7, // Higher base opacity for Back Bay tracts
        0.2  // Lower opacity for non-Back Bay tracts
      ]);
      
      // Set line styles based on neighborhood
      map.setPaintProperty('backbay-outline', 'line-color', [
        'case',
        ['==', ['get', 'is_backbay'], true],
        '#555555', // Normal color for Back Bay tract outlines
        '#AAAAAA'  // Lighter color for other tract outlines
      ]);
      
      map.setPaintProperty('backbay-outline', 'line-width', [
        'case',
        ['==', ['get', 'is_backbay'], true],
        0.5,  // Normal width for Back Bay tract outlines
        0.2   // Thinner for other tract outlines
      ]);
      
      // Apply selection styling if any tracts are selected
      if ($backbaySelectedTracts.length > 0) {
        updateFillOpacity($backbaySelectedTracts);
      }
      
      // Update legend
      updateLegend();
      
      // Fit map to Back Bay boundaries
      if (backbayFeature) {
        const backbayBounds = turf.bbox(backbayFeature);
        map.fitBounds(backbayBounds, {
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
      <div class="legend-title">${legendTitle}</div>
      <div class="legend-scale">
        <div class="legend-item">
          <div class="legend-color" style="background-color: #e8faef;"></div>
          <div class="legend-label">${colorScaleLabels[0]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #c7f3e0;"></div>
          <div class="legend-label">${colorScaleLabels[1]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #88e4cc;"></div>
          <div class="legend-label">${colorScaleLabels[2]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #58cbad;"></div>
          <div class="legend-label">${colorScaleLabels[3]}</div>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #2da88a;"></div>
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

  // Function to highlight hovered tract from scatter plot
  function highlightHoveredTract(tractId) {
    try {
      if (!map || !map.getLayer('backbay-fill')) return;
      
      if (tractId) {
        // Update the outline properties for the hovered tract
        map.setPaintProperty('backbay-outline', 'line-width', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          3,      // Much thicker for hovered
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('backbay-outline', 'line-color', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          '#2da88a', // Match the Back Bay boundary color
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          '#000000', // Black outline for selected tracts
          '#555555'  // Gray outline for non-selected tracts
        ]);
        
        // Update fill opacity to emphasize the hovered tract
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          0.9,    // Highest opacity for hovered tract
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          0.8,    // High opacity for selected tracts
          ['==', ['get', 'is_backbay'], true],
          0.7,    // Medium opacity for Back Bay tracts
          0.2     // Low opacity for non-Back Bay tracts
        ]);
        
        // Add a pulsing effect
        if (map.getLayer('backbay-hovered-tract')) {
          map.setFilter('backbay-hovered-tract', ['==', ['get', 'tract_id'], tractId]);
          map.setPaintProperty('backbay-hovered-tract', 'line-opacity', 0.8);
        }
      } else {
        // Reset to normal state when not hovering
        map.setPaintProperty('backbay-outline', 'line-width', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('backbay-outline', 'line-color', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          '#000000', // Black outline for selected tracts
          '#555555'  // Gray outline for non-selected tracts
        ]);
        
        // Reset fill opacity
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          0.8,    // Selected tracts
          ['==', ['get', 'is_backbay'], true],
          0.7,    // Medium opacity for Back Bay tracts
          0.2     // Low opacity for non-Back Bay tracts
        ]);
        
        // Remove pulse effect
        if (map.getLayer('backbay-hovered-tract')) {
          map.setFilter('backbay-hovered-tract', ['==', 'tract_id', '']);
        }
      }
    } catch (error) {
      console.error("Error highlighting hovered tract:", error);
    }
  }

  // Add a watcher to re-run selectBackbayTracts when data changes
  $: if (mapInitialized && 
         tracts.length > 0 && 
         $neighborhoodsData && 
         Object.keys($neighborhoodsData).length > 0 &&
         $boundaryData && 
         $boundaryData.features && 
         $boundaryData.features.length > 0) {
    console.log("All data is available, selecting Back Bay tracts");
    selectBackbayTracts();
  }




  // Set up map interactions in a separate function
  function setupMapInteractions(popup) {
    if (!map) return;
    
    // Make sure map is ready for interaction
    if (!map.isStyleLoaded()) {
      setTimeout(() => setupMapInteractions(popup), 100);
      return;
    }
    
    console.log("Setting up map interactions");
    
    // Remove any existing handlers first to avoid duplicates
    map.off('click', 'backbay-fill');
    map.off('mousemove', 'backbay-fill');
    map.off('mouseleave', 'backbay-fill');
    
    // Add click handler for census tracts
    map.on('click', 'backbay-fill', (e) => {
      if (e.features.length > 0) {
        const tractId = e.features[0].properties.tract_id;
        console.log("Clicked on tract:", tractId);
        
        // Update Back Bay selected census tracts
        backbaySelectedTracts.update(selected => {
          if (selected.includes(tractId)) {
            return selected.filter(id => id !== tractId);
          } else {
            return [...selected, tractId];
          }
        });
      }
    });
    
    // Use a single popup instance for better performance with improved hover interaction
    map.on('mousemove', 'backbay-fill', (e) => {
      if (e.features.length > 0) {
        const feature = e.features[0];
        const tractId = feature.properties.tract_id;
        const indexValue = feature.properties.index_value;
        const evictionRate = feature.properties.eviction_rate;
        
        // Update hover state in store to sync with scatter plot
        hoveredCensusTract.set(tractId);
        map.getCanvas().style.cursor = 'pointer';
        
        // Format value based on index type
        let formattedValue = '';
        if (Flipindex === 'median_rent') {
          formattedValue = `$${indexValue.toLocaleString()}`;
        } else if (Flipindex === 'median_price_diff') {
          formattedValue = `$${indexValue.toLocaleString()}`;
        }
        
        // Update existing popup instead of creating a new one
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <h4>Census Tract</h4>
            <p><strong>GEOID:</strong> ${tractId}</p>
            <p><strong>${Flipindex === 'median_rent' ? 'Median Rent' : 'Median Price Difference'}:</strong> ${formattedValue}</p>
            <p><strong>Eviction Rate (${year}):</strong> ${(evictionRate * 100).toFixed(1)}%</p>
          `)
          .addTo(map);
      }
    });
    
    map.on('mouseleave', 'backbay-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
      hoveredCensusTract.set(null); // Clear hover state
    });
    
    // Add a click handler on the entire map to ensure it's interactive
    map.on('click', () => {
      console.log('Map clicked, ensuring interactive state');
      mapContainer.focus();
    });
  }
  
  // Make sure we refresh the map when component becomes visible
  function refreshBackbayMap() {
    console.log("Refreshing Back Bay map");
    if (!map) return;
    
    // Even if map isn't fully initialized, set up a retry mechanism
    if (!mapInitialized || !map.isStyleLoaded()) {
      setTimeout(() => refreshBackbayMap(), 200);
      return;
    }
    
    // Clear existing selections
    backbaySelectedTracts.set([]);
    
    // Force the map to update
    updateMapLayers(false);
    
    // Give the map a moment to process the update, then select tracts
    setTimeout(() => {
      selectBackbayTracts();
      
      // Force map interaction by programmatically triggering a resize event
      map.resize();
      
      // Re-setup interactions to ensure they're properly bound
      if (!interactionsInitialized) {
        setupMapInteractions(new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'map-popup-smooth'
        }));
        interactionsInitialized = true;
      }
    }, 300);
  }

  // Export the refresh function
  export { refreshBackbayMap };
</script>

<!-- Fix the redundant role warning by removing the role attribute -->
<section 
  class="map-container" 
  bind:this={mapContainer}
  aria-label="Back Bay interactive map"
></section>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    outline: none; /* Remove focus outline */
    cursor: grab; /* Add grab cursor to indicate draggable */
  }
  
  /* Style for when the map is being dragged */
  :global(.mapboxgl-canvas-container.mapboxgl-interactive:active) {
    cursor: grabbing;
  }
  
  /* Add style for navigation controls */
  :global(.mapboxgl-ctrl-top-right) {
    top: 10px;
    right: 10px;
  }
  
  /* Make the map popup transitions smoother */
  :global(.map-popup-smooth) {
    transition: opacity 0.2s;
  }
  
  :global(.map-popup-smooth .mapboxgl-popup-content) {
    transition: transform 0.2s;
    transform-origin: 50% 0;
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
