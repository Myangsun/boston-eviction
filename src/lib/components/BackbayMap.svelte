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
  // Add local default flipindex in case global store is empty
  let localFlipindex = 'median_rent';
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
  
  // Add debug flags to control console output and prevent infinite loops
  const DEBUG_MODE = false;
  let selectionAttempts = 0;
  const MAX_SELECTION_ATTEMPTS = 3;
  let selectionInProgress = false;
  let lastSelectedTracts = [];
  
  // Function to update the fill opacity based on selected tracts
  function updateFillOpacity(selected) {
    try {
      console.log("Updating fill opacity for Back Bay tracts:", selected);
      
      // Check if map and layers are ready
      if (!map || !map.getSource('backbay-data') || !map.getLayer('backbay-fill')) {
        console.log("Map or layers not ready yet");
        return;
      }

      // Ensure selected is always an array
      selected = Array.isArray(selected) ? selected : [];
      
      // For clarity about which tracts are being modified
      const hasSelectedTracts = selected.length > 0;
      
      // Always save the current selection for reference
      lastSelectedTracts = [...selected];
      
      // Update fill opacity using more basic expressions
      if (selected.length > 0) {
        const filter = ['in', ['get', 'tract_id'], ['literal', selected]];
        
        // Apply separate paint properties with case expressions
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          filter,
          0.9, // Highest opacity for selected tracts
          ['==', ['get', 'is_backbay'], true],
          hasSelectedTracts ? 0.4 : 0.7, // Medium opacity for Back Bay tracts
          hasSelectedTracts ? 0.1 : 0.2  // Low opacity for other tracts
        ]);

        // Update line width
        map.setPaintProperty('backbay-outline', 'line-width', [
          'case',
          filter,
          2, // Increased width for selected tracts
          ['==', ['get', 'is_backbay'], true],
          0.5, // Normal for Back Bay tracts
          0.2  // Thinnest for other tracts
        ]);
        
        // Update line color
        map.setPaintProperty('backbay-outline', 'line-color', [
          'case',
          filter,
          '#000000', // Black outline for selected tracts
          ['==', ['get', 'is_backbay'], true],
          '#555555', // Dark gray for Back Bay tracts
          '#AAAAAA'  // Light gray for other tracts
        ]);
      } else {
        // When nothing is selected, use simpler expressions
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'is_backbay'], true],
          0.7, // Normal opacity for Back Bay tracts
          0.2  // Low opacity for other tracts
        ]);
        
        map.setPaintProperty('backbay-outline', 'line-width', [
          'case',
          ['==', ['get', 'is_backbay'], true],
          0.5, // Normal for Back Bay tracts
          0.2  // Thinnest for other tracts
        ]);
        
        map.setPaintProperty('backbay-outline', 'line-color', [
          'case',
          ['==', ['get', 'is_backbay'], true],
          '#555555', // Dark gray for Back Bay tracts
          '#AAAAAA'  // Light gray for other tract outlines
        ]);
      }
      
      // CRITICAL FIX: Use correct filter syntax for selected tracts layer
      if (selected.length === 0) {
        // No tracts selected, use a filter that matches nothing
        map.setFilter('backbay-selected', ['==', 'tract_id', '']);
      } else if (selected.length === 1) {
        // Single tract - use equality
        map.setFilter('backbay-selected', ['==', 'tract_id', selected[0]]);
      } else {
        // Multiple tracts - use match operator which is more reliable
        map.setFilter('backbay-selected', ['match', ['get', 'tract_id'], selected, true, false]);
      }
      
      console.log("Fill opacity updated successfully for tracts:", selected);
    } catch (error) {
      console.error("Error updating fill opacity:", error);
    }
  }

  // Add a safety check to make sure data is properly loaded before proceeding
  function ensureDataLoaded() {
    // Check for valid neighborhoods data
    if (!$neighborhoodsData || !$neighborhoodsData.features || !Array.isArray($neighborhoodsData.features)) {
      if (DEBUG_MODE) console.error("Neighborhoods data is not properly loaded");
      return false;
    }
    
    // Check for valid boundary data
    if (!$boundaryData || !$boundaryData.features || !Array.isArray($boundaryData.features)) {
      if (DEBUG_MODE) console.error("Boundary data is not properly loaded");
      return false;
    }
    
    // Check for valid tract data
    if (!tracts || !Array.isArray(tracts) || tracts.length === 0) {
      if (DEBUG_MODE) console.error("Tract data is not properly loaded");
      return false;
    }
    
    return true;
  }

  // Function to select Back Bay census tracts with improved tract ID matching
  function selectBackbayTracts() {
    // Prevent infinite loops and multiple concurrent selections
    if (selectionInProgress) {
      return;
    }
    
    selectionAttempts++;
    if (selectionAttempts > MAX_SELECTION_ATTEMPTS) {
      console.log(`Max selection attempts (${MAX_SELECTION_ATTEMPTS}) reached, stopping.`);
      return;
    }
    
    selectionInProgress = true;
    console.log(`Attempting to select Back Bay tracts (attempt ${selectionAttempts})`);
    
    if (!ensureDataLoaded()) {
      selectionInProgress = false;
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
        selectionInProgress = false;
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
        selectionInProgress = false;
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
          if (DEBUG_MODE) console.error(`Error processing tract ${tractId}:`, err);
        }
      });
      
      // Log a summary instead of individual messages
      if (missingCount > 0) {
        console.log(`${missingCount} census tracts were skipped due to missing boundary data.`);
      }
      
      console.log(`Found ${backbayTracts.length} tracts within Back Bay`);
      
      // Only set tracts if we found some and the selection has changed
      if (backbayTracts.length > 0 && JSON.stringify(backbayTracts) !== JSON.stringify($backbaySelectedTracts)) {
        console.log("Setting Back Bay selected census tracts to:", backbayTracts);
        
        // IMPORTANT: Set directly without the clear+delay pattern that was causing loops
        backbaySelectedTracts.set(backbayTracts);
        
        // Apply the selection immediately to the map
        if (map && map.isStyleLoaded() && map.getLayer('backbay-fill')) {
          updateFillOpacity(backbayTracts);
        }
      }
    } catch (error) {
      console.error("Error selecting Back Bay tracts:", error);
    } finally {
      selectionInProgress = false;
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

  // Modified subscription to handle potentially empty Flipindex value
  const unsubscribeFlipindex = selectedFlipindex.subscribe(value => {
    // Always have a default value for Flipindex even if the global store is empty
    const effectiveValue = value || localFlipindex;
    if (Flipindex !== effectiveValue) {
      Flipindex = effectiveValue;
      if (map) updateMapLayers();
    }
  });
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
    if (map) updateMapLayers();
  });
  
  const unsubscribedorchesterData = dorchesterData.subscribe(value => {
    tracts = value;
    if (map) updateMapLayers();
    
    // Only attempt to select tracts if we haven't reached the max attempts
    if (tracts.length > 0 && $neighborhoodsData && 
        Object.keys($neighborhoodsData).length > 0 &&
        selectionAttempts < MAX_SELECTION_ATTEMPTS) {
      selectBackbayTracts();
    }
  });
  
  const unsubscribeBoundaryData = boundaryData.subscribe(value => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  
  // Modify the subscription to prevent infinite loops
  const unsubscribeSelectedCensusTracts = backbaySelectedTracts.subscribe(selected => {
    // Only update the map if selection has changed and is not empty
    if (selected.length > 0 && JSON.stringify(selected) !== JSON.stringify(lastSelectedTracts)) {
      lastSelectedTracts = [...selected];
      
      if (map && map.getLayer('backbay-fill') && map.isStyleLoaded()) {
        console.log("Applying Back Bay tract selection to map");
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
    // Reset selection attempts counter on mount
    selectionAttempts = 0;
    lastSelectedTracts = [];
    
    // Make sure we have a valid flipindex even if global store is empty
    if (!$selectedFlipindex) {
      Flipindex = localFlipindex;
    } else {
      Flipindex = $selectedFlipindex;
    }
    
    console.log("BackbayMap component mounted with flipindex:", Flipindex);
    
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
        center: [-71.080, 42.350], // Fixed Back Bay center
        zoom: 14, // Fixed zoom level for Back Bay
        minZoom: 14, // Lock zoom to this exact level
        maxZoom: 14, // Lock zoom to this exact level
        dragPan: false, // Disable panning completely
        dragRotate: false, // Disable rotation
        scrollZoom: false, // Disable scroll zoom
        doubleClickZoom: false, // Disable double-click zoom
        touchZoomRotate: false, // Disable touch zoom and rotate
        attributionControl: false // Hide attribution for cleaner UI
      });
      
      // Only add navigation control for the fullscreen option
      map.addControl(new mapboxgl.NavigationControl({
        showCompass: false,
        showZoom: false, // Hide zoom controls
        visualizePitch: false
      }), 'top-right');
      
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
            //                 <h4>Census Tract</h4>
            // <p><strong>GEOID:</strong> ${tractId}</p>
            popup
              .setLngLat(e.lngLat)
              .setHTML(`
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

        // Center map on Back Bay and restrict navigation
        setTimeout(() => {
          // Find Back Bay boundary
          const backbayFeature = $neighborhoodsData?.features?.find(
            f => f.properties.blockgr2020_ctr_neighb_name === 'Back Bay' || 
                 f.properties.name === 'Back Bay'
          );
          
          if (backbayFeature) {
            // Get bounding box
            const backbayBounds = turf.bbox(backbayFeature);
            
            // Set the bounds with minimal padding
            map.fitBounds(backbayBounds, {
              padding: 30,
              duration: 500,
              maxZoom: 15
            });
            
            // Add map constraints
            map.scrollZoom.disable();
            map.boxZoom.disable();
            map.dragRotate.disable();
            map.touchZoomRotate.disable();
            map.dragPan.enable();
            
            // Set max bounds
            const buffer = 0.01;
            map.setMaxBounds([
              [backbayBounds[0] - buffer, backbayBounds[1] - buffer],
              [backbayBounds[2] + buffer, backbayBounds[3] + buffer]
            ]);
          }
        }, 500);

        // Remove the problematic layer if it exists
        if (map.getLayer('backbay-hovered-tract')) {
          map.removeLayer('backbay-hovered-tract');
          console.log("Removed problematic hover layer");
        }
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

      // Also clean up any direct subscriptions
      if (window.mapUnsubscribes) {
        window.mapUnsubscribes.forEach(unsub => unsub());
        window.mapUnsubscribes = [];
      }

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
          
          // Add selected outline layer - FIX: Initialize with a valid filter that works with empty arrays
          map.addLayer({
            id: 'backbay-selected',
            type: 'line',
            source: 'backbay-data',
            paint: {
              'line-color': '#000',
              'line-width': 3
            },
            filter: ['==', 'tract_id', ''] // Start with nothing selected
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
      
      // IMPORTANT: DO NOT create the backbay-hovered-tract layer at all!
      // The layer was completely removed from initialization
      
      // Add a shadow layer for hovering if not already present - DO create it now, contrary to previous instructions
      if (!map.getLayer('backbay-hovered-shadow')) {
        try {
          map.addLayer({
            id: 'backbay-hovered-shadow',
            type: 'line',
            source: 'backbay-data',
            paint: {
              'line-color': '#88e4cc', // Teal for Back Bay theme
              'line-width': 12, // Much wider (was 8)
              'line-blur': 8, // More blur (was 5)
              'line-opacity': 0.8 // Higher opacity (was 0.7)
            },
            filter: ['==', 'tract_id', ''] // Initially empty filter
          }, 'backbay-fill'); // Place below the fill layer for shadow effect
        } catch (err) {
          console.log("Shadow layer couldn't be created:", err);
        }
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
      
      // Get effective Flipindex value
      const effectiveFlipindex = Flipindex || localFlipindex;
      
      console.log("Updating map layers with data, using flipindex:", effectiveFlipindex);
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
        if (effectiveFlipindex === 'median_rent') {
          indexValue = +tract[`median_rent`];
        } else if (effectiveFlipindex === 'median_price_diff') {
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
      if (effectiveFlipindex === 'median_rent') {
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
      } else if (effectiveFlipindex === 'median_price_diff') {
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
      if (effectiveFlipindex === 'median_rent') {
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
      } else if (effectiveFlipindex === 'median_price_diff') {
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
  
    let legendTitle = '';
    let colorScaleLabels = [];
    
    // Use effective Flipindex value
    const effectiveFlipindex = Flipindex || localFlipindex;
    
    if (effectiveFlipindex === 'median_rent') {
      legendTitle = 'Median Monthly Rent';
      colorScaleLabels = ['$400', '$1k', '$2k', '$3k', '$3.5k+'];
    } else if (effectiveFlipindex === 'median_price_diff') {
      legendTitle = 'Median Price Difference';
      colorScaleLabels = ['-$50k', '$0', '$50k', '$100k', '$135k+'];
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
      
      // Ensure selected is always an array
      selected = Array.isArray(selected) ? selected : [];
      
      // Use the same filter syntax as in updateFillOpacity
      if (selected.length === 0) {
        map.setFilter('backbay-selected', ['==', 'tract_id', '']);
      } else if (selected.length === 1) {
        map.setFilter('backbay-selected', ['==', 'tract_id', selected[0]]);
      } else {
        map.setFilter('backbay-selected', ['match', ['get', 'tract_id'], selected, true, false]);
      }
    } catch (error) {
      console.error("Error updating selected tracts:", error);
    }
  }

  // Function to highlight hovered tract - enhanced with thick black border and prominent shadow
  function highlightHoveredTract(tractId) {
    try {
      if (!map || !map.getLayer('backbay-fill')) return;
      
      if (tractId) {
        // Update fill opacity to make hovered tract COMPLETELY opaque
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          1.0,   // Full opacity (was 0.95) for hovered tract
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          0.8,    // High opacity for selected tracts
          ['==', ['get', 'is_backbay'], true],
          0.7,    // Medium opacity for Back Bay tracts
          0.2     // Low opacity for non-Back Bay tracts
        ]);
        
        // Make the hovered tract's border even thicker black
        map.setPaintProperty('backbay-outline', 'line-width', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          6,      // Even thicker (was 5) for hovered
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('backbay-outline', 'line-color', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          '#000000', // Black outline for hover
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          '#000000', // Black outline for selected tracts
          '#555555'  // Gray outline for non-selected tracts
        ]);
        
        // Update the shadow effect to be significantly more prominent
        if (map.getLayer('backbay-hovered-shadow')) {
          map.setFilter('backbay-hovered-shadow', ['==', ['get', 'tract_id'], tractId]);
          map.setPaintProperty('backbay-hovered-shadow', 'line-color', '#88e4cc'); // Keep tint that matches Back Bay theme
          map.setPaintProperty('backbay-hovered-shadow', 'line-width', 12); // Much wider (was 8)
          map.setPaintProperty('backbay-hovered-shadow', 'line-blur', 8); // More blur (was 5)
          map.setPaintProperty('backbay-hovered-shadow', 'line-opacity', 0.8); // Higher opacity (was 0.7)
        }
      } else {
        // Reset to normal state when not hovering
        map.setPaintProperty('backbay-fill', 'fill-opacity', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $backbaySelectedTracts]],
          0.8,    // Selected tracts
          ['==', ['get', 'is_backbay'], true],
          0.7,    // Medium opacity for Back Bay tracts
          0.2     // Low opacity for non-Back Bay tracts
        ]);
        
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
        
        // Remove shadow effect
        if (map.getLayer('backbay-hovered-shadow')) {
          map.setFilter('backbay-hovered-shadow', ['==', 'tract_id', '']);
        }
      }
    } catch (error) {
      console.error("Error highlighting hovered tract:", error);
    }
  }

  // Modified watcher to prevent infinite loops
  $: if (mapInitialized && 
         tracts.length > 0 && 
         $neighborhoodsData && 
         Object.keys($neighborhoodsData).length > 0 &&
         $boundaryData && 
         $boundaryData.features && 
         $boundaryData.features.length > 0 &&
         selectionAttempts < MAX_SELECTION_ATTEMPTS &&
         !selectionInProgress) {
    if (DEBUG_MODE) console.log("All data is available, selecting Back Bay tracts");
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
        
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
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

    // Ensure the map doesn't respond to drag events for panning
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.doubleClickZoom.disable();

    // Add a direct handler for selection changes
    const directUpdateSelection = (selected) => {
      try {
        if (map && map.getLayer('backbay-fill')) {
          console.log("Direct selection update:", selected);
          updateFillOpacity(selected);
        }
      } catch (error) {
        console.error("Error in direct selection update:", error);
      }
    };
    
    // Attach the handler to the store
    const unsubDirect = backbaySelectedTracts.subscribe(directUpdateSelection);
    
    // Save this unsubscribe function to clean up later
    if (!window.mapUnsubscribes) window.mapUnsubscribes = [];
    window.mapUnsubscribes.push(unsubDirect);
  }
  
  // Make sure we refresh the map when component becomes visible
  function refreshBackbayMap() {
    // Reset counters when manually refreshing
    selectionAttempts = 0;
    selectionInProgress = false;
    
    // Make sure we have a valid flipindex even if global store is empty
    if (!Flipindex) {
      Flipindex = localFlipindex;
    }
    
    console.log("Refreshing Back Bay map with flipindex:", Flipindex);
    if (!map) return;
    
    // Even if map isn't fully initialized, set up a retry mechanism
    if (!mapInitialized || !map.isStyleLoaded()) {
      setTimeout(() => refreshBackbayMap(), 200);
      return;
    }
    
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

      // Force update the current selection visualization with extra safety check
      if ($backbaySelectedTracts && Array.isArray($backbaySelectedTracts) && $backbaySelectedTracts.length > 0) {
        console.log("Forcing update of selection:", $backbaySelectedTracts);
        updateFillOpacity($backbaySelectedTracts);
      } else {
        // If there's no selection, use an empty array
        updateFillOpacity([]);
      }

      // Simply ensure all navigation is disabled
      if (map) {
        map.scrollZoom.disable();
        map.boxZoom.disable();
        map.dragRotate.disable();
        map.touchZoomRotate.disable();
        map.dragPan.disable(); // Also disable panning
        map.doubleClickZoom.disable();
        map.keyboard.disable();
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
    cursor: default; /* Change from grab to default cursor */
  }
  
  /* Remove the grabbing cursor style */
  :global(.mapboxgl-canvas-container.mapboxgl-interactive) {
    cursor: default !important;
  }
  
  :global(.mapboxgl-canvas-container.mapboxgl-interactive:active) {
    cursor: default !important;
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
  
  /* Fix the legend width issue - make it slightly smaller */
  :global(.map-legend) {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: white;
    padding: 12px; /* Reduced from 15px */
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    z-index: 1;
    font-size: 0.75rem; /* Reduced from 0.8rem */
    min-width: 200px; /* Reduced from 240px */
    max-width: 240px; /* Reduced from 280px */
  }
  
  :global(.legend-title) {
    font-weight: bold;
    margin-bottom: 4px; /* Reduced from 5px */
    margin-top: 8px; /* Reduced from 10px */
    text-align: center;
  }
  
  :global(.legend-scale) {
    display: flex;
    align-items: baseline; /* Align items to bottom */
    justify-content: space-between; /* Distribute items evenly */
    margin-bottom: 8px; /* Reduced from 10px */
    width: 100%; /* Use full width */
  }
  
  :global(.legend-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20%; /* Equal width for all items */
    padding: 0 2px; /* Add some padding */
  }
  
  :global(.legend-color) {
    width: 100%; /* Full width of container */
    height: 12px; /* Reduced from 15px */
    margin-bottom: 3px; /* Reduced from 4px */
  }
  
  :global(.legend-label) {
    font-size: 0.65rem; /* Reduced from 0.7rem */
    text-align: center;
    word-wrap: break-word; /* Allow text to wrap */
    line-height: 1.2; /* Improve readability */
  }
  
  :global(.legend-circles) {
    display: flex;
    align-items: baseline;
    margin-bottom: 5px; /* Reduced from 5px */
    justify-content: space-around; /* Distribute items evenly */
  }
  
  :global(.legend-circle-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
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
