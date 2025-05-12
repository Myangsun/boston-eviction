<script>
  import { onMount } from 'svelte';
  import { selectedYear, dataLoading, backbaySelectedTracts, selectedFlipindex } from '$lib/stores.js';
  import BackbayMap from '$lib/components/BackbayMap.svelte';
  import ScatterPlot2 from '$lib/components/ScatterPlot2.svelte';
  
  // Year selection and flipindex tracking
  let year;
  let flipindex;
  let isLoading = true;
  
  // Reference to components
  let backbayMapComponent;
  let scatterPlotComponent;
  
  // Track refresh state
  let initialRefreshPerformed = false;
  let refreshCounter = 0; // Track how many refreshes have happened
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
  });
  
  const unsubscribeFlipindex = selectedFlipindex.subscribe(value => {
    flipindex = value;
  });
  
  const unsubscribeLoading = dataLoading.subscribe(value => {
    isLoading = value;
  });
  
  // Track if Back Bay tracts have been selected
  const unsubscribeBackbayTracts = backbaySelectedTracts.subscribe(tracts => {
    // If we have tracts selected, consider the section loaded properly
    if (tracts && tracts.length > 0) {
      initialRefreshPerformed = true;
    }
  });
  
  function setYear(newYear) {
    selectedYear.set(newYear);
  }
  
  function setFlipindex(type) {
    console.log(`Setting flipindex to ${type} from NeighborhoodSection2`);
    // Set the flipindex and then refresh components to ensure everything updates
    selectedFlipindex.set(type);
    
    // Wait for the store to update before refreshing
    setTimeout(() => forceRefreshSelection(), 50);
  }
  
  onMount(() => {
    // Add a more aggressive initial refresh with a back-up refresh
    if (!initialRefreshPerformed) {
      setTimeout(() => {
        forceRefreshSelection();
        refreshCounter++;
        
        // Always do a second refresh after a delay for good measure
        setTimeout(() => {
          forceRefreshSelection();
          refreshCounter++;
          initialRefreshPerformed = true;
          
          // One final refresh after everything has settled
          setTimeout(() => forceRefreshSelection(), 1000);
        }, 500);
      }, 300);
    }
    
    // Add an interaction timer to refresh components after inactivity
    let lastInteraction = Date.now();
    const checkInactivity = setInterval(() => {
      // If it's been more than 60 seconds since last user interaction
      if (Date.now() - lastInteraction > 60000) {
        // Refresh both components
        refreshComponents();
        lastInteraction = Date.now(); // Reset the timer
      }
    }, 30000); // Check every 30 seconds
    
    // Track user interaction
    document.addEventListener('mousemove', () => {
      lastInteraction = Date.now();
    });
    
    document.addEventListener('click', () => {
      lastInteraction = Date.now();
    });
    
    // Cleanup on component destroy
    return () => {
      unsubscribeYear();
      unsubscribeLoading();
      unsubscribeBackbayTracts();
      unsubscribeFlipindex();
      clearInterval(checkInactivity);
      document.removeEventListener('mousemove', () => {});
      document.removeEventListener('click', () => {});
    };
  });
  
  // Combined function to refresh both components
  function refreshComponents() {
    console.log("Refreshing BackBay neighborhood components");
    
    // Refresh the map
    if (backbayMapComponent) {
      if (typeof backbayMapComponent.refreshBackbayMap === 'function') {
        backbayMapComponent.refreshBackbayMap();
      }
    }
    
    // Refresh the scatter plot with more explicit checks
    if (scatterPlotComponent) {
      if (typeof scatterPlotComponent.refreshScatterPlot === 'function') {
        // This should now include selected points refresh
        scatterPlotComponent.refreshScatterPlot();
      } else if (typeof scatterPlotComponent.refreshHoverState === 'function') {
        scatterPlotComponent.refreshHoverState();
      }
    }
  }
  
  // Add a function to force both components to refresh selection state
  function forceRefreshSelection() {
    console.log("Forcing refresh of Back Bay selection state");
    
    // Get the current selection
    const currentSelection = $backbaySelectedTracts;
    
    if (currentSelection && currentSelection.length > 0) {
      // Force update by temporarily clearing selection and then restoring it
      const tempSelection = [...currentSelection];
      backbaySelectedTracts.set([]);
      
      setTimeout(() => {
        backbaySelectedTracts.set(tempSelection);
        
        // Then explicitly refresh both components
        setTimeout(() => refreshComponents(), 50);
      }, 50);
    } else {
      // Just refresh components if there's no selection
      refreshComponents();
    }
  }
  
  // Export the refreshBackbayMap function for external access
  export function refreshBackbayMap() {
    forceRefreshSelection();
  }
</script>

<section id="neighborhood2-section" class="section">
  <div class="section-header">
    <h2 class="backbay-title">Back Bay Neighborhood Analysis</h2>
    <p>Does the cost of rent and the profit from property flipping indicate eviction risk in Back Bay?</p>
  </div>
  
  <div class="control-panel">
    <div class="year-selector">
      <label>Year:</label>
      <div class="button-group">
        <button class:active={year === '2020'} on:click={() => setYear('2020')}>2020</button>
        <button class:active={year === '2021'} on:click={() => setYear('2021')}>2021</button>
        <button class:active={year === '2022'} on:click={() => setYear('2022')}>2022</button>
        <button class:active={year === '2023'} on:click={() => setYear('2023')}>2023</button>
      </div>
    </div>
    
    <div class="flipindex-selector">
      <label>Data Type:</label>
      <div class="button-group">
        <button class:active={flipindex === 'median_rent'} on:click={() => setFlipindex('median_rent')}>
          Rent
        </button>
        <button class:active={flipindex === 'median_price_diff'} on:click={() => setFlipindex('median_price_diff')}>
          Flip Difference
        </button>
      </div>
    </div>
  </div>
  
  {#if isLoading}
    <div class="loading-container">
      <div class="loader"></div>
      <p>Loading map and data...</p>
    </div>
  {:else}
    <div class="visualization-container">
      <div class="map-side">
        <BackbayMap bind:this={backbayMapComponent} />
      </div>
      <div class="chart-side">
        <ScatterPlot2 bind:this={scatterPlotComponent} />
      </div>
    </div>
  {/if}
  <div class="section-header">
    <h2 class="backbay-findings">Findings</h2>
  </div>

  <div class="text-box-container">
    <div class="text-box">
      <p>Back Bay has some of the highest rent levels in Boston and shows significant flipping profits. High resale margins reflect strong speculative interest in the neighborhood.</p>
    </div>
  
    <div class="text-box">
      <p>In general, high rent is associated with lower eviction rates. In contrast, lower-rent areas are more likely to experience evictions. But there is a moderate eviction rate within Back Bay, meaning that high-rent properties can not opt out of eviction risks.</p>
    </div>
  
    <div class="text-box">
      <p>Flip difference has a relatively significant positive relationship with eviction rate, suggesting speculative resale activity contributes to displacement risk. This correlation indicates that speculative turnover may drive displacement more than rent levels alone.</p>
    </div>

</section>

<style>
  .year-selector {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
    opacity: 1;
    transform: translateY(0);
  }
  
  /* Adding the Back Bay section title color */
  .backbay-title {
    color: #88e4cc;
    font-size: 2rem;

  }
  .backbay-findings {
    color: #88e4cc;
    font-size: 2rem; /* Pink color for Dorchester */
  }
  
  /* Style the year selector buttons */
  .year-selector button {
    padding: 0.5rem 1rem;
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
    color: #000;
    font-family: 'Roboto', sans-serif;
  }
  
  .year-selector button:hover {
    background-color: #f5f5f5;
  }
  
  .year-selector button.active {
    background-color: #88e4cc; /* Teal for Back Bay */
    color: black;
    border-color: #88e4cc;
  }
  
  .visualization-container {
    display: flex;
    flex-direction: row;
    justify-content: center; /* Center the content horizontally */
    align-items: stretch; /* Make children stretch to fill height */
    gap: 20px;
    margin: 20px auto; /* Center the container with auto margins */
    max-width: 1200px; /* Maximum width for the container */
    width: 90%; /* Use 90% of available width */
  }
  
  .map-side, .chart-side {
    flex: 1; /* Both take equal space */
    min-height: 500px; /* Taller minimum height */
    width: 100%; /* Ensure full width in column layout */
    display: block;
    position: relative;
  }
  
  /* Make sure the map and chart components take full height of their containers */
  .map-side :global(.map-container),
  .chart-side :global(.chart-container) {
    height: 100%;
    min-height: 500px;
    width: 100%;
  }
  
  /* Media query for when screen is narrowed */
  @media (max-width: 960px) {
    .visualization-container {
      flex-direction: column;
      width: 95%; /* Slightly wider on mobile */
    }
    
    .map-side {
      order: 1 !important; /* Ensure map is first */
      margin-bottom: 20px;
      height: 400px; /* Fixed height for map on mobile */
    }
    
    .chart-side {
      order: 2 !important; /* Ensure chart is second */
      height: 400px; /* Fixed height for chart on mobile */
    }
  }
  .text-box-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center; /* Center the content horizontally */
  align-items: stretch; /* Make children stretch to fill height */
  gap: 50px;
  margin: 0px auto; /* Center the container with auto margins */
  margin-top: 10px;
  max-width: 1200px; 
  }

  .text-box {
    border: 3px solid #88e4cc;
    box-shadow: 6px 6px 0px #88e4cc;
    padding: 1.5rem;
    max-width: 350px;
    min-height: 200px;
    color: #000;
    font-size: 1rem;
    line-height: 1.5;
    font-family: 'Roboto', sans-serif;
  }

  
  /* Add loading styles */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 500px;
    width: 100%;
  }
  
  .loader {
    border: 5px solid #f3f3f3;
    border-top: 5px solid #88e4cc; /* Teal for Back Bay */
    border-radius: 50%;
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .control-panel {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 2rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }
  
  .year-selector, .flipindex-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  
  .button-group {
    display: flex;
    gap: 0.5rem;
  }
  
  label {
    font-weight: bold;
    font-size: 0.9rem;
    color: #666;
  }
  
  .year-selector button, .flipindex-selector button {
    padding: 0.5rem 1rem;
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
    color: #000;
    font-family: 'Roboto', sans-serif;
    min-width: 70px; /* Ensure consistent button widths */
  }
  
  .year-selector button:hover, .flipindex-selector button:hover {
    background-color: #f5f5f5;
  }
  
  .year-selector button.active, .flipindex-selector button.active {
    background-color: #88e4cc; /* Teal for Back Bay */
    color: black;
    border-color: #88e4cc;
    font-weight: bold;
  }
</style>