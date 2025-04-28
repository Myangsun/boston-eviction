import { writable, derived } from "svelte/store";
import { csv, json } from "d3";

// First, let's create separate stores for each neighborhood's selected tracts
// Moving these earlier to prevent access before initialization issues
export const dorchesterSelectedTracts = writable([]);
export const backbaySelectedTracts = writable([]);

// Global state stores
export const selectedYear = writable("2023");
export const selectedInvestorType = writable("institutional");
export const selectedFlipindex = writable("median_rent");
export const visibleLayers = writable({
  institutional: true,
  large: false,
  medium: false,
  small: false,
  evictions: true,
});

// Scrollytelling state stores
export const activeSection = writable("title");
export const scrollProgress = writable(0);

// Data stores
export const evictionData = writable([]);
export const boundaryData = writable({});
export const dorchesterData = writable([]);
export const neighborhoodsData = writable({});
export const censusData = writable([])        
export const currentTheme = writable("investor")


// New derived store for map hover state
export const hoveredCensusTract = writable(null);

// Global min/max values for consistent scaling
export const dataScales = writable({
  maxInvestorCount: 0,
  maxEvictionRate: 0,
  maxMedianRent: 3501,      
  minMedianRent: 394,       
  maxMedianPriceDiff: 134500, // capped a extreme value around 400k 
  minMedianPriceDiff: -46625 
});

// Helper function to standardize keys to lowercase
function standardizeData(data) {
  return data.map(item => {
    const standardized = {};
    
    // Convert all keys to lowercase
    Object.keys(item).forEach(key => {
      standardized[key.toLowerCase()] = item[key];
    });
    
    return standardized;
  });
}

// Helper function to standardize GeoJSON properties to lowercase
function standardizeGeoJSON(geojson) {
  // Create a deep copy to avoid mutating the original
  const result = JSON.parse(JSON.stringify(geojson));
  
  // Process each feature's properties
  if (result.features) {
    result.features = result.features.map(feature => {
      if (feature.properties) {
        const lowercaseProps = {};
        Object.keys(feature.properties).forEach(key => {
          lowercaseProps[key.toLowerCase()] = feature.properties[key];
        });
        feature.properties = lowercaseProps;
      }
      return feature;
    });
  }
  
  return result;
}

// Add this function to normalize and standardize tract IDs
function normalizeTractId(id) {
  if (!id) return null;
  // Convert to string
  id = String(id);
  // Remove any non-digit characters
  return id.replace(/\D/g, '');
}

// Load data
export async function loadData() {
  try {
    console.log("Loading data...");

    // Load eviction data
    const data = await csv("./data/processed_eviction_data.csv");
    console.log("Loaded eviction data:", data.length);

    // Load Boston neighborhoods GeoJSON
    const response = await fetch("./data/Boston_Neighborhoods.geojson");
    const bostonNeighborhoodsData = await response.json();

    // Set global scales and normalize tract IDs

    // Calculate global min/max values for scaling
    const allInvestorCounts = [];
    const allEvictionRates = [];
    const allMedianRents = [];
    const allMedianPriceDiffs = [];

    data.forEach((d) => {
      // Add all investor counts to array
      allInvestorCounts.push(+d.sum_institutional_investor || 0);
      allInvestorCounts.push(+d.sum_large_investor || 0);
      allInvestorCounts.push(+d.sum_medium_investor || 0);
      allInvestorCounts.push(+d.sum_small_investor || 0);

      // Add all eviction rates to array
      allEvictionRates.push(+d.eviction_rate_2020 || 0);
      allEvictionRates.push(+d.eviction_rate_2021 || 0);
      allEvictionRates.push(+d.eviction_rate_2022 || 0);
      allEvictionRates.push(+d.eviction_rate_2023 || 0);
    
      // Add median rent 
      allMedianRents.push(+d.median_rent || 0);
  
      // Add median price diff - handle both positive and negative values
      const priceDiff = +d.median_price_diff;
      if (!isNaN(priceDiff)) {
        allMedianPriceDiffs.push(priceDiff);
      }
    });

    // Set global scales
    dataScales.set({
      maxInvestorCount: Math.max(...allInvestorCounts),
      maxEvictionRate: Math.max(...allEvictionRates.filter((rate) => rate < 1)), // Filter out 100% rates
      minMedianRent: Math.min(...allMedianRents) || 394,
      maxMedianRent: Math.max(...allMedianRents) || 3501,
      
      minMedianPriceDiff: Math.min(...allMedianPriceDiffs) || -46625,
      maxMedianPriceDiff: 134500
    });

    // Process data to standardize tract IDs
    data.forEach(tract => {
      if (tract.GEOID) {
        tract.normalized_id = normalizeTractId(tract.GEOID);
      } else if (tract.tract_id) {
        tract.normalized_id = normalizeTractId(tract.tract_id);
      } else if (tract.geoid) {
        tract.normalized_id = normalizeTractId(tract.geoid);
      }
    });

    // Set eviction data
    evictionData.set(data);

    // Use all data for both maps, no filtering for Dorchester
    dorchesterData.set(data);

    try {
      // Load Boston neighborhoods GeoJSON with error handling
      const response = await fetch("/data/Boston_Neighborhoods.geojson");
      let bostonNeighborhoodsData = {};
      
      if (response.ok) {
        try {
          bostonNeighborhoodsData = await response.json();
          
          // Check if the file is empty or missing features
          if (!bostonNeighborhoodsData || !bostonNeighborhoodsData.features || !Array.isArray(bostonNeighborhoodsData.features)) {
            console.error("Boston neighborhoods data is missing features array");
            
            // Create a default neighborhoods structure
            bostonNeighborhoodsData = {
              type: "FeatureCollection",
              features: [
                createDefaultNeighborhood("Dorchester", [-71.053, 42.300]),
                createDefaultNeighborhood("Back Bay", [-71.080, 42.350])
              ]
            };
          }
        } catch (error) {
          console.error("Error parsing Boston neighborhoods GeoJSON:", error);
          
          // Create default neighborhoods data
          bostonNeighborhoodsData = {
            type: "FeatureCollection",
            features: [
              createDefaultNeighborhood("Dorchester", [-71.053, 42.300]),
              createDefaultNeighborhood("Back Bay", [-71.080, 42.350])
            ]
          };
        }
      } else {
        console.error("Failed to fetch Boston neighborhoods GeoJSON");
        
        // Create default neighborhoods data
        bostonNeighborhoodsData = {
          type: "FeatureCollection",
          features: [
            createDefaultNeighborhood("Dorchester", [-71.053, 42.300]),
            createDefaultNeighborhood("Back Bay", [-71.080, 42.350])
          ]
        };
      }
      
      // Set neighborhoods data
      neighborhoodsData.set(bostonNeighborhoodsData);
      console.log("Loaded Boston neighborhoods data:", bostonNeighborhoodsData.features.length);
    } catch (error) {
      console.error("Error loading neighborhoods data:", error);
      
      // Set fallback neighborhoods data
      const fallbackData = {
        type: "FeatureCollection",
        features: [
          createDefaultNeighborhood("Dorchester", [-71.053, 42.300]),
          createDefaultNeighborhood("Back Bay", [-71.080, 42.350])
        ]
      };
      
      neighborhoodsData.set(fallbackData);
    }

    try {
      // Load boundary data with error handling
      let boundaries = {};
      
      try {
        const boundariesResponse = await fetch("./data/Metro_Boston_Census_Tracts.geojson");
        
        if (boundariesResponse.ok) {
          try {
            boundaries = await boundariesResponse.json();
          } catch (error) {
            console.error("Error parsing census tracts GeoJSON:", error);
            boundaries = createDefaultBoundaries(data);
          }
        } else {
          console.error("Failed to fetch census tracts GeoJSON");
          boundaries = createDefaultBoundaries(data);
        }
      } catch (error) {
        console.error("Error loading boundary data:", error);
        boundaries = createDefaultBoundaries(data);
      }
      
      // Validate the boundaries data
      if (!boundaries || !boundaries.features || !Array.isArray(boundaries.features) || boundaries.features.length === 0) {
        console.error("Invalid or empty boundary data");
        boundaries = createDefaultBoundaries(data);
      }
      
      // Normalize tract IDs in boundary data
      boundaries.features.forEach(feature => {
        const props = feature.properties;
        if (props.GEOID) {
          props.normalized_id = normalizeTractId(props.GEOID);
        } else if (props.geoid) {
          props.normalized_id = normalizeTractId(props.geoid);
        } else if (props.tract_id) {
          props.normalized_id = normalizeTractId(props.tract_id);
        }
      });
      
      console.log("Loaded boundary data:", boundaries.features.length);
      boundaryData.set(boundaries);
    } catch (error) {
      console.error("Error processing boundary data:", error);
      
      // Set fallback boundary data
      const fallbackBoundaries = createDefaultBoundaries(data);
      boundaryData.set(fallbackBoundaries);
    }

    // Load census data
    const census = await csv("./public/data/census.csv");
    console.log("Loaded census data:", census.length);
    censusData.set(census);

    return true;
  } catch (error) {
    console.error("Error loading data:", error);
    return false;
  }
}

// Helper function to create a default neighborhood polygon
function createDefaultNeighborhood(name, center) {
  // Create a simple polygon around the center coordinates
  const delta = 0.02; // ~2km
  
  return {
    type: "Feature",
    properties: {
      blockgr2020_ctr_neighb_name: name,
      name: name
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [center[0] - delta, center[1] - delta],
        [center[0] + delta, center[1] - delta],
        [center[0] + delta, center[1] + delta],
        [center[0] - delta, center[1] + delta],
        [center[0] - delta, center[1] - delta]
      ]]
    }
  };
}

// Helper function to create default boundaries based on available tract data
function createDefaultBoundaries(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }
  
  // Get unique tract IDs
  const tractIds = new Set();
  data.forEach(item => {
    const id = item.GEOID || item.tract_id || item.geoid;
    if (id) tractIds.add(id);
  });
  
  // Create simple rectangular features for each tract
  const features = Array.from(tractIds).map((id, index) => {
    // Create a grid layout
    const row = Math.floor(index / 10);
    const col = index % 10;
    const size = 0.005; // ~500m
    const baseX = -71.08;
    const baseY = 42.35;
    
    return {
      type: "Feature",
      properties: {
        GEOID: id,
        tract_id: id,
        geoid: id
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [baseX + col * size, baseY + row * size],
          [baseX + (col + 1) * size, baseY + row * size],
          [baseX + (col + 1) * size, baseY + (row + 1) * size],
          [baseX + col * size, baseY + (row + 1) * size],
          [baseX + col * size, baseY + row * size]
        ]]
      }
    };
  });
  
  return {
    type: "FeatureCollection",
    features: features
  };
}

// Derived store for investor type scatter plot data
export const scatterPlotData = derived(
  [
    evictionData,
    selectedInvestorType,
    selectedYear,
    dorchesterSelectedTracts, // Changed from selectedCensusTracts
    dataScales,
  ],
  ([
    $evictionData,
    $selectedInvestorType,
    $selectedYear,
    $dorchesterSelectedTracts, // Changed from $selectedCensusTracts
    $dataScales,
  ]) => {
    if (!$evictionData || !$evictionData.length)
      return { allPoints: [], bostonAverage: { x: 0, y: 0 } };

    // Create data points for scatter plot
    const allPoints = $evictionData
      .map((tract) => {
        const x = +tract[`sum_${$selectedInvestorType}_investor`] || 0;
        const y = +tract[`eviction_rate_${$selectedYear}`] || 0;

        return {
          tract_id: tract.GEOID,
          x,
          y,
          selected: $dorchesterSelectedTracts.includes(tract.GEOID), // Changed from $selectedCensusTracts
        };
      })
      .filter((point) => point.y < 1); // Filter out 100% eviction rates

    // Calculate Boston average
    const totalX = allPoints.reduce((sum, point) => sum + point.x, 0);
    const totalY = allPoints.reduce((sum, point) => sum + point.y, 0);
    const avgX = totalX / allPoints.length;
    const avgY = totalY / allPoints.length;

    // Create data for all years for trajectories
    const years = ['2020', '2021', '2022', '2023'];
    const allYearsData = {};
    
    years.forEach(yr => {
      allYearsData[yr] = $evictionData.map(tract => {
        return {
          tract_id: tract.GEOID,
          x: +tract[`sum_${$selectedInvestorType}_investor`] || 0,
          y: +tract[`eviction_rate_${yr}`] || 0
        };
      }).filter(point => point.y < 1);
    });

    return {
      allPoints,
      bostonAverage: { x: avgX, y: avgY },
      maxX: $dataScales.maxInvestorCount,
      maxY: $dataScales.maxEvictionRate,
      allYearsData
    };
  }
);

// Derived store for indicators scatter plot data
export const scatterPlotData2 = derived(
  [
    evictionData,
    selectedFlipindex,
    selectedYear,
    backbaySelectedTracts, // Changed from selectedCensusTracts
    dataScales,
  ],
  ([
    $evictionData,
    $selectedFlipindex,
    $selectedYear,
    $backbaySelectedTracts, // Changed from $selectedCensusTracts
    $dataScales,
  ]) => {
    if (!$evictionData || !$evictionData.length)
      return { allPoints: [], bostonAverage: { x: 0, y: 0 } };

    // Create data points for scatter plot
    const allPoints = $evictionData
      .map((tract) => {
    
        let x;
        if ($selectedFlipindex === 'median_rent') {
          x = +tract.median_rent || 0;
          
          if (isNaN(x) || tract.median_rent === null || tract.median_rent === "NA" || x === 0) {
            return null; 
          }
        } else if ($selectedFlipindex === 'median_price_diff') {
          x = +tract.median_price_diff;
     
          if (isNaN(x) || tract.median_price_diff === null || tract.median_price_diff === "NA") {
            return null; 
          }
          // Cap extremely high values!
          x = Math.min(x, $dataScales.maxMedianPriceDiff);
        }
        
        const y = +tract[`eviction_rate_${$selectedYear}`] || 0;

        return {
          tract_id: tract.GEOID,
          x,
          y,
          selected: $backbaySelectedTracts.includes(tract.GEOID), // Changed from $selectedCensusTracts
        };
      })
      .filter((point) => point !== null && point.y < 1); // Filter out 100% eviction rates

    // Calculate Boston average
    const totalX = allPoints.reduce((sum, point) => sum + point.x, 0);
    const totalY = allPoints.reduce((sum, point) => sum + point.y, 0);
    const avgX = totalX / allPoints.length || 0;
    const avgY = totalY / allPoints.length || 0;

    // Set appropriate max and min values based on selected indicator
    let maxX, minX;
    if ($selectedFlipindex === 'median_rent') {
      maxX = $dataScales.maxMedianRent;
      minX = $dataScales.minMedianRent;
    } else if ($selectedFlipindex === 'median_price_diff') {
      maxX = $dataScales.maxMedianPriceDiff;
      minX = $dataScales.minMedianPriceDiff;
    }

    return {
      allPoints,
      bostonAverage: { x: avgX, y: avgY },
      maxX,
      minX,
      maxY: $dataScales.maxEvictionRate,
      minY: 0
    };
  }
);

// Keep the original selectedCensusTracts for compatibility
// but let's derive it based on the currently active section
export const selectedCensusTracts = derived(
  [dorchesterSelectedTracts, backbaySelectedTracts, activeSection],
  ([$dorchesterSelectedTracts, $backbaySelectedTracts, $activeSection]) => {
    // Return the appropriate selection based on which section is active
    if ($activeSection === 'neighborhood2') {
      return $backbaySelectedTracts;
    } else {
      return $dorchesterSelectedTracts;
    }
  }
);