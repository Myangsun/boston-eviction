import { writable, derived } from "svelte/store";
import { csv, json } from "d3";

// Global state stores
export const selectedYear = writable("2023");
export const selectedInvestorType = writable("institutional");
export const selectedFlipindex = writable("median_rent");
export const selectedCensusTracts = writable([]);
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
// Load data
export async function loadData() {
  try {
    console.log("Loading data...");

    // Load eviction data
    const data = await csv("./data/processed_eviction_data.csv");
    console.log("Loaded eviction data:", data.length);

    // Load Back Bay specific data
    const backbayDataset = await csv("./data/processed_eviction_data_ngh.csv");
    console.log("Loaded Back Bay data:", backbayDataset.length);

    // Load Boston neighborhoods GeoJSON
    const response = await fetch("./data/Boston_Neighborhoods.geojson");
    const bostonNeighborhoodsData = await response.json();

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

    // Set eviction data
    evictionData.set(data);

    // Use all data for both maps, no filtering for Dorchester
    dorchesterData.set(data);

    // Set neighborhoods data
    neighborhoodsData.set(bostonNeighborhoodsData);
    console.log(
      "Loaded Boston neighborhoods data:",
      bostonNeighborhoodsData.features.length
    );

    // Load boundary data - use the Metro_Boston_Census_Tracts.geojson file
    const boundaries = await json("./data/Metro_Boston_Census_Tracts.geojson");
    console.log("Loaded boundary data:", boundaries.features.length);
    boundaryData.set(boundaries);

    return true;
  } catch (error) {
    console.error("Error loading data:", error);
    return false;
  }
}

// Derived store for investor type scatter plot data
export const scatterPlotData = derived(
  [
    evictionData,
    selectedInvestorType,
    selectedYear,
    selectedCensusTracts,
    dataScales,
  ],
  ([
    $evictionData,
    $selectedInvestorType,
    $selectedYear,
    $selectedCensusTracts,
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
          selected: $selectedCensusTracts.includes(tract.GEOID),
        };
      })
      .filter((point) => point.y < 1); // Filter out 100% eviction rates

    // Calculate Boston average
    const totalX = allPoints.reduce((sum, point) => sum + point.x, 0);
    const totalY = allPoints.reduce((sum, point) => sum + point.y, 0);
    const avgX = totalX / allPoints.length;
    const avgY = totalY / allPoints.length;

    return {
      allPoints,
      bostonAverage: { x: avgX, y: avgY },
      maxX: $dataScales.maxInvestorCount,
      maxY: $dataScales.maxEvictionRate,
    };
  }
);


// Derived store for indicators scatter plot data
export const scatterPlotData2 = derived(
  [
    evictionData,
    selectedFlipindex,
    selectedYear,
    selectedCensusTracts,
    dataScales,
  ],
  ([
    $evictionData,
    $selectedFlipindex,
    $selectedYear,
    $selectedCensusTracts,
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
          selected: $selectedCensusTracts.includes(tract.GEOID),
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