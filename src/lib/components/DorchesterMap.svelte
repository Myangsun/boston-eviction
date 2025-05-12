<script>
  // Fix the import order to ensure dorchesterSelectedTracts is imported before it's used
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  // Import dorchesterSelectedTracts earlier in the import sequence
  import { 
    dorchesterSelectedTracts,
    dorchesterData, 
    boundaryData, 
    selectedCensusTracts, 
    selectedInvestorType, 
    selectedYear, 
    dataScales, 
    neighborhoodsData, 
    hoveredCensusTract 
  } from '$lib/stores.js';
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

  // Ensure map is fully initialized before attempting to select tracts
  let mapInitialized = false;

  // Add diagnostic flag to track selection issues
  let selectionAttempts = 0;
  let dorchesterTractIdsFound = [];

  // Function to update the fill opacity based on selected tracts
  function updateFillOpacity(selected) {
    try {
      console.log("DEBUG: Updating fill opacity for Dorchester tracts:", selected);
      if (!selected || selected.length === 0) {
        console.log("DEBUG: No selected tracts to highlight");
        return;
      }
      
      // Ensure map is initialized and layer exists
      if (!map || !map.getSource('dorchester-data') || !map.getLayer('dorchester-fill')) {
        console.log("DEBUG: Map or layers not ready yet");
        return;
      }
      
      // Log the map state
      console.log("DEBUG: Map style loaded:", map.isStyleLoaded());
      
      // Set the fill opacity with multi-condition logic
      map.setPaintProperty('dorchester-fill', 'fill-opacity', [
        'case',
        ['in', ['get', 'tract_id'], ['literal', selected]],
        1.0, // Highest opacity for selected tracts
        ['==', ['get', 'is_dorchester'], true],
        0.7, // Medium opacity for Dorchester tracts
        0.2  // Low opacity for other tracts
      ]);

      // Similar multi-condition styling for outlines
      map.setPaintProperty('dorchester-outline', 'line-width', [
        'case',
        ['in', ['get', 'tract_id'], ['literal', selected]],
        1.5, // Thickest for selected tracts
        ['==', ['get', 'is_dorchester'], true],
        0.5, // Normal for Dorchester tracts
        0.2  // Thinnest for other tracts
      ]);
      
      map.setPaintProperty('dorchester-outline', 'line-color', [
        'case',
        ['in', ['get', 'tract_id'], ['literal', selected]],
        '#000000', // Black outline for selected tracts
        ['==', ['get', 'is_dorchester'], true],
        '#555555', // Dark gray for Dorchester tracts
        '#AAAAAA'  // Light gray for other tracts
      ]);
      
      console.log("DEBUG: Fill opacity updated successfully");
    } catch (error) {
      console.error("Error updating fill opacity:", error);
    }
  }

  // Helper function to find boundary feature with flexible ID matching
  function findBoundaryFeature(tractId, tractIdMap) {
    // Direct lookup first (if map provided)
    if (tractIdMap && tractId in tractIdMap) {
      return tractIdMap[tractId];
    }
    
    // Try with/without leading zeros
    const withoutLeadingZeros = tractId.replace(/^0+/, '');
    if (tractIdMap && withoutLeadingZeros in tractIdMap) {
      return tractIdMap[withoutLeadingZeros];
    }
    
    const withLeadingZero = `0${tractId}`;
    if (tractIdMap && withLeadingZero in tractIdMap) {
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

  // Modified function to ensure tracts are selected properly with better ID matching
  function selectDorchesterTracts() {
    console.log("DEBUG: Attempting to select Dorchester tracts, attempt #", ++selectionAttempts);
    
    if (!ensureDataLoaded()) {
      setTimeout(() => selectDorchesterTracts(), 1000);
      return;
    }
    
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
        // We need to handle MultiPolygon properly by creating a Feature collection
        const polygons = [];
        dorchesterFeature.geometry.coordinates.forEach((coords, i) => {
          polygons.push(turf.polygon(coords));
        });
        dorchesterPolygon = turf.featureCollection(polygons);
      } else {
        console.error("Unsupported geometry type:", dorchesterFeature.geometry.type);
        return;
      }
      
      // Create a map of tract IDs to boundary features for faster lookup
      const tractIdToBoundary = {};
      
      // First, build a lookup map with all possible ID formats
      $boundaryData.features.forEach(feature => {
        const props = feature.properties;
        // Store by GEOID with different capitalizations
        if (props.GEOID) tractIdToBoundary[props.GEOID] = feature;
        if (props.geoid) tractIdToBoundary[props.geoid] = feature;
        if (props.tract_id) tractIdToBoundary[props.tract_id] = feature;
        
        // Also try with and without leading zeros for compatibility
        if (props.GEOID) {
          tractIdToBoundary[props.GEOID.replace(/^0+/, '')] = feature;
          tractIdToBoundary[`0${props.GEOID}`] = feature;
        }
      });
      
      // Find all census tracts that are within Dorchester
      const dorchesterTracts = [];
      const processedTracts = new Set(); // To avoid duplicates
      const missingBoundaries = new Set(); // To track missing tract boundaries
      
      // Check each tract
      $dorchesterData.forEach(tract => {
        // Get tract ID - try all known property names
        const tractId = tract.tract_id || tract.GEOID || tract.geoid;
        
        if (!tractId) {
          return; // Skip this tract silently
        }
        
        // Avoid processing the same tract multiple times
        if (processedTracts.has(tractId)) {
          return;
        }
        processedTracts.add(tractId);
        
        // Try to find boundary with flexible matching
        const boundaryFeature = findBoundaryFeature(tractId, tractIdToBoundary);
        
        if (!boundaryFeature) {
          // Simply skip this tract silently
          return;
        }
        
        try {
          // Calculate centroid of the tract
          const centroid = turf.centroid(boundaryFeature);
          
          // Check if the centroid is within any of the Dorchester polygons
          let isWithinDorchester = false;
          
          if (dorchesterFeature.geometry.type === 'Polygon') {
            isWithinDorchester = turf.booleanPointInPolygon(centroid, dorchesterPolygon);
          } else if (dorchesterFeature.geometry.type === 'MultiPolygon') {
            // Check against each polygon in the MultiPolygon
            dorchesterFeature.geometry.coordinates.forEach(coords => {
              const poly = turf.polygon(coords);
              if (turf.booleanPointInPolygon(centroid, poly)) {
                isWithinDorchester = true;
              }
            });
          }
          
          if (isWithinDorchester) {
            dorchesterTracts.push(tractId);
          }
        } catch (err) {
          // Skip this tract on error
        }
      });
      
      console.log(`DEBUG: Found ${dorchesterTracts.length} tracts within Dorchester:`, dorchesterTracts);
      dorchesterTractIdsFound = dorchesterTracts; // Store for debugging
      
      // Set the selected census tracts specifically for Dorchester
      if (dorchesterTracts.length > 0) {
        console.log("DEBUG: Setting Dorchester selected census tracts to:", dorchesterTracts);
        
        // Clear first, then set the new tracts
        dorchesterSelectedTracts.set([]);
        setTimeout(() => {
          console.log("DEBUG: Now setting Dorchester tracts after clearing");
          dorchesterSelectedTracts.set(dorchesterTracts);
          
          // Double check that the store was updated correctly
          setTimeout(() => {
            console.log("DEBUG: Dorchester selected tracts store value:", $dorchesterSelectedTracts);
            
            // Direct application of style to ensure it works
            if (map && map.isStyleLoaded() && map.getLayer('dorchester-fill')) {
              console.log("DEBUG: Directly applying styles to map");
              updateFillOpacity(dorchesterTracts);
            }
          }, 100);
        }, 100);
      }
    } catch (error) {
      console.error("Error selecting Dorchester tracts:", error);
    }
  }

  // Add a refreshDorchesterMap function similar to the one in BackbayMap
  function refreshDorchesterMap() {
    console.log("DEBUG: Refreshing Dorchester map");
    
    // Reset selection attempts counter for tracking
    selectionAttempts = 0;
    
    if (mapInitialized && map) {
      console.log("DEBUG: Map is initialized, checking style loaded status:", map.isStyleLoaded());
      
      // Make sure the map is ready
      if (map.isStyleLoaded()) {
        // First make sure our source and layers exist
        console.log("DEBUG: Source exists:", map.getSource('dorchester-data') ? "yes" : "no");
        console.log("DEBUG: Layer exists:", map.getLayer('dorchester-fill') ? "yes" : "no");
        
        // Clear selections first
        dorchesterSelectedTracts.set([]);
        
        // Force update map layers to ensure they're loaded properly
        updateMapLayers();
        
        // Try multiple selection attempts with increasing delays
        setTimeout(() => selectDorchesterTracts(), 200);
        setTimeout(() => {
          // Check if selection worked, if not try again
          if ($dorchesterSelectedTracts.length === 0) {
            console.log("DEBUG: First attempt failed, trying again");
            selectDorchesterTracts();
          }
        }, 500);
        setTimeout(() => {
          // One final attempt if needed
          if ($dorchesterSelectedTracts.length === 0) {
            console.log("DEBUG: Second attempt failed, trying one more time");
            selectDorchesterTracts();
            
            // If we have found IDs but store is empty, force it
            if (dorchesterTractIdsFound.length > 0 && $dorchesterSelectedTracts.length === 0) {
              console.log("DEBUG: Force setting Dorchester tract IDs");
              dorchesterSelectedTracts.set([...dorchesterTractIdsFound]);
            }
          }
        }, 1000);
      } else {
        // If style isn't loaded yet, wait and try again
        setTimeout(() => refreshDorchesterMap(), 500);
      }
    }
  }

  // Export the refresh function
  export { refreshDorchesterMap };

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
  const unsubscribeSelectedCensusTracts = dorchesterSelectedTracts.subscribe(selected => {
    console.log("DEBUG: dorchesterSelectedTracts changed:", selected);
    
    // When selected tracts change, update the layer opacity
    if (map && map.getLayer('dorchester-fill')) {
      try {
        if (map.isStyleLoaded()) {
          console.log("DEBUG: Tract selection changed, updating map:", selected);
          if (selected.length === 0 && selectionAttempts < 5) {
            // If no tracts are selected and we haven't tried too many times, retry
            console.log("DEBUG: No tracts selected, retrying selection");
            setTimeout(() => selectDorchesterTracts(), 200);
          } else {
            updateFillOpacity(selected);
          }
        } else {
          console.log("DEBUG: Map style not loaded, delaying update");
          setTimeout(() => updateFillOpacity(selected), 500);
        }
      } catch (error) {
        console.error("Error in dorchesterSelectedTracts subscription:", error);
      }
    } else {
      console.log("DEBUG: Map or dorchester-fill layer not ready yet");
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
      
      // Create a single reusable popup outside of event handlers
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
      });
      
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
        console.log("DEBUG: Map loaded event fired");
        
        mapInitialized = true;
        initializeMapLayers();
        
        // Add hover interactions after map is initialized
        addMapHoverInteraction();
        
        // First try to select tracts immediately after map is loaded
        setTimeout(() => {
          console.log("DEBUG: Delayed first selection attempt");
          selectDorchesterTracts();
          
          // Try again with increasing delays
          setTimeout(() => selectDorchesterTracts(), 500);
          setTimeout(() => selectDorchesterTracts(), 1000);
          setTimeout(() => selectDorchesterTracts(), 2000);
        }, 200);
        
        // Use a single popup instance for better performance
        map.on('mousemove', 'dorchester-fill', (e) => {
          if (e.features.length > 0) {
            const feature = e.features[0];
            const tractId = feature.properties.tract_id;
            const investorCount = feature.properties.investor_count;
            const evictionRate = feature.properties.eviction_rate;
            
            // Update hover state in store to sync with scatter plot
            hoveredCensusTract.set(tractId);
            map.getCanvas().style.cursor = 'pointer';
            
            // Update existing popup instead of creating a new one
            popup
              .setLngLat(e.lngLat)
              .setHTML(`
                <p>${investorType.charAt(0).toUpperCase() + investorType.slice(1)} Investors: ${investorCount}</p>
                <p>Eviction Rate (${year}): ${(evictionRate * 100).toFixed(1)}%</p>
              `)
              .addTo(map);
          }
        });
        
        map.on('mouseleave', 'dorchester-fill', () => {
          map.getCanvas().style.cursor = '';
          popup.remove(); // Just remove the popup, don't iterate through DOM
          hoveredCensusTract.set(null); // Clear hover state
        });

        // Add this block to forcibly disable all census tract selection behavior
        setTimeout(() => {
          // Clear any tract selection that might have happened
          dorchesterSelectedTracts.set([]);
          
          // Nullify any click handlers by adding event listeners that stop event propagation
          // This ensures that ANY click on the map won't trigger selection
          if (map.getCanvas()) {
            map.getCanvas().addEventListener('click', (e) => {
              // Only for clicks on the map, not on controls
              if (e.target === map.getCanvas()) {
                e.stopPropagation();
              }
            }, true); // Use capturing phase to stop event early
          }
          
          // Explicitly disable click-based selection styling
          map.setPaintProperty('dorchester-fill', 'fill-opacity', [
            'case',
            ['==', ['get', 'is_dorchester'], true],
            0.7, // Normal opacity for Dorchester tracts - no selection highlighting
            0.2  // Lower opacity for other tracts
          ]);
          
          // Add an explicit empty click handler that takes precedence
          map.on('click', 'dorchester-fill', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          });
          
          // Force map into a "non-interactive" mode for click selection
          map.dragPan.disable();
          map.scrollZoom.disable();
          map.doubleClickZoom.disable();
        }, 500);
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
  
  // Initialize map layers with error handling
  function initializeMapLayers() {
    try {
      console.log("Initializing map layers");
      
      // Add sources and layers with error handling
      try {
        if (!map.getSource('dorchester-data')) {
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
      
      if (!ensureDataLoaded()) {
        console.log("Waiting for data to be properly loaded");
        setTimeout(() => updateMapLayers(), 1000);
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
      
      console.log("DEBUG: Updating map layers with data");
      
      // Find Dorchester neighborhood for filtering
      const dorchesterFeature = $neighborhoodsData?.features?.find(
        f => f.properties.blockgr2020_ctr_neighb_name === 'Dorchester' || 
             f.properties.name === 'Dorchester'
      );
      
      // Create a list of Dorchester tract IDs for filtering
      const dorchesterTractIds = [];
      
      if (dorchesterFeature && $boundaryData && $boundaryData.features) {
        // For each census tract, check if its centroid is within Dorchester
        $boundaryData.features.forEach(feature => {
          try {
            const tractId = feature.properties.GEOID || 
                           feature.properties.geoid || 
                           feature.properties.tract_id;
            
            if (!tractId) return;
            
            const centroid = turf.centroid(feature);
            let isWithinDorchester = false;
            
            // Check if centroid is within Dorchester
            if (dorchesterFeature.geometry.type === 'Polygon') {
              isWithinDorchester = turf.booleanPointInPolygon(centroid, 
                turf.polygon(dorchesterFeature.geometry.coordinates));
            } else if (dorchesterFeature.geometry.type === 'MultiPolygon') {
              dorchesterFeature.geometry.coordinates.forEach(coords => {
                if (turf.booleanPointInPolygon(centroid, turf.polygon(coords))) {
                  isWithinDorchester = true;
                }
              });
            }
            
            if (isWithinDorchester) {
              dorchesterTractIds.push(tractId);
            }
          } catch (err) {
            // Skip this tract on error
          }
        });
      }
      
      console.log("DEBUG: Found Dorchester tract IDs:", dorchesterTractIds);
      
      // Create a map of tract IDs to boundary features for faster lookup
      const tractIdToBoundary = {};
      $boundaryData.features.forEach(feature => {
        const props = feature.properties;
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
      const missingBoundaries = new Set(); // Track missing boundaries
      
      // Loop through ALL census tracts to show the entire city, but mark Dorchester ones
      tracts.forEach(tract => {
        const tractId = tract.GEOID || tract.tract_id || tract.geoid;
        
        // Find boundary with flexible matching - skip if not found
        const boundaryFeature = findBoundaryFeature(tractId, tractIdToBoundary);
        
        if (!boundaryFeature) {
          return; // Skip this tract silently
        }
        
        // Calculate centroid for the eviction circle
        let centroid = calculateCentroid(boundaryFeature.geometry);
        
        // Mark if this tract is within Dorchester
        const isDorchester = dorchesterTractIds.includes(tractId);
        
        // Add point feature for eviction circle
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: centroid
          },
          properties: {
            tract_id: tractId,
            investor_count: +tract[`sum_${investorType}_investor`] || 0,
            eviction_rate: +tract[`eviction_rate_${year}`] || 0,
            is_dorchester: isDorchester
          }
        });
        
        // Add polygon feature for fill
        features.push({
          type: 'Feature',
          geometry: boundaryFeature.geometry,
          properties: {
            tract_id: tractId,
            investor_count: +tract[`sum_${investorType}_investor`] || 0,
            eviction_rate: +tract[`eviction_rate_${year}`] || 0,
            is_dorchester: isDorchester
          }
        });
      });
      
      console.log("DEBUG: Created features for map:", features.length);
      
      // Update source data
      map.getSource('dorchester-data').setData({
        type: 'FeatureCollection',
        features: features
      });
      
      // Update fill layer color scale based on global max values
      if (scales.maxInvestorCount > 0) {
        // Update to consider neighborhood in fill color and opacity
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
        
        // Set base opacity based on whether tract is in Dorchester
        map.setPaintProperty('dorchester-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'is_dorchester'], true],
          0.7, // Higher base opacity for Dorchester tracts
          0.2  // Lower opacity for non-Dorchester tracts
        ]);
      }
      
      // Update line properties to make non-Dorchester tracts less prominent
      map.setPaintProperty('dorchester-outline', 'line-color', [
        'case',
        ['==', ['get', 'is_dorchester'], true],
        '#555555', // Normal color for Dorchester tract outlines
        '#AAAAAA'  // Lighter color for other tract outlines
      ]);
      
      map.setPaintProperty('dorchester-outline', 'line-width', [
        'case',
        ['==', ['get', 'is_dorchester'], true],
        0.5,  // Normal width for Dorchester tract outlines
        0.2   // Thinner for other tract outlines
      ]);
      
      // Update selection styling for when tracts are explicitly selected
      if ($dorchesterSelectedTracts.length > 0) {
        updateFillOpacity($dorchesterSelectedTracts);
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
          ['in', ['get', 'tract_id'], ['literal', $dorchesterSelectedTracts]], // Fix: Use dorchesterSelectedTracts instead of selectedCensusTracts
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('dorchester-outline', 'line-color', [
          'case',
          ['==', ['get', 'tract_id'], tractId],
          '#a04e62', // Match the Dorchester boundary color
          ['in', ['get', 'tract_id'], ['literal', $dorchesterSelectedTracts]], // Fix: Use dorchesterSelectedTracts instead of selectedCensusTracts
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
          ['in', ['get', 'tract_id'], ['literal', $dorchesterSelectedTracts]], // Fix: Use dorchesterSelectedTracts instead of selectedCensusTracts
          1.5,    // Selected tracts
          0.5     // Normal width
        ]);
        
        map.setPaintProperty('dorchester-outline', 'line-color', [
          'case',
          ['in', ['get', 'tract_id'], ['literal', $dorchesterSelectedTracts]], // Fix: Use dorchesterSelectedTracts instead of selectedCensusTracts
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

  // Add a watcher to re-run selectDorchesterTracts when data changes
  $: if (mapInitialized && 
         tracts.length > 0 && 
         $neighborhoodsData && 
         Object.keys($neighborhoodsData).length > 0 &&
         $boundaryData && 
         $boundaryData.features && 
         $boundaryData.features.length > 0) {
    console.log("All data is available, selecting Dorchester tracts");
    selectDorchesterTracts();
  }

  // Remove redundant function since we're now handling this in the mousemove event
  function addMapHoverInteraction() {
    // Keep this as a stub function since it's called elsewhere
    // but don't add any click handlers
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
  }
  :global(.mapboxgl-popup-content) {
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

    /* padding: 15px;
    border-radius: 5px;
  } */
  
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
