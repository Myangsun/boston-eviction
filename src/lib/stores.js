import { writable, derived } from "svelte/store";
import { csv, json } from "d3";

// Global state stores
export const selectedYear = writable("2023");
export const selectedInvestorType = writable("institutional");
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
export const censusData = writable([])        
export const currentTheme = writable("investor")


// Global min/max values for consistent scaling
export const dataScales = writable({
  maxInvestorCount: 0,
  maxEvictionRate: 0,
});

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

    // Calculate global min/max values for scaling
    const allInvestorCounts = [];
    const allEvictionRates = [];

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
    });

    // Set global scales
    dataScales.set({
      maxInvestorCount: Math.max(...allInvestorCounts),
      maxEvictionRate: Math.max(...allEvictionRates.filter((rate) => rate < 1)), // Filter out 100% rates
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

// Derived store for scatter plot data
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
