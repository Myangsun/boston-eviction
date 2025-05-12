<script>
  import { onMount } from 'svelte';
  import { selectedYear, dataLoading } from '$lib/stores.js';
  import DorchesterMap from '$lib/components/DorchesterMap.svelte';
  import ScatterPlot from '$lib/components/ScatterPlot.svelte';
  
  // Year selection
  let year;
  
  // Reference to the DorchesterMap component
  let dorchesterMapComponent;
  
  // Add loading and error state variables
  let loading = true;
  let error = null;
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
  });
  
  // Subscribe to global data loading state
  const unsubscribeLoading = dataLoading.subscribe(value => {
    loading = value;
  });
  
  function setYear(newYear) {
    selectedYear.set(newYear);
  }
  
  onMount(() => {
    // Cleanup on component destroy
    return () => {
      unsubscribeYear();
      unsubscribeLoading();
    };
  });
  
  // Export the refreshDorchesterMap function for external access
  export function refreshDorchesterMap() {
    if (dorchesterMapComponent && typeof dorchesterMapComponent.refreshDorchesterMap === 'function') {
      dorchesterMapComponent.refreshDorchesterMap();
    }
  }
</script>

<section id="neighborhood-section" class="section">
  <div class="section-header">
    <h2 class="dorchester-title">Dorchester Neighborhood Analysis</h2>
    <p>Explore the relationship between investor ownership and eviction rates in Dorchester census tracts.</p>
  </div>
  
  <div class="year-selector">
    <button class:active={year === '2020'} on:click={() => setYear('2020')}>2020</button>
    <button class:active={year === '2021'} on:click={() => setYear('2021')}>2021</button>
    <button class:active={year === '2022'} on:click={() => setYear('2022')}>2022</button>
    <button class:active={year === '2023'} on:click={() => setYear('2023')}>2023</button>
  </div>
  
  {#if loading}
    <div class="loading-container">
      <div class="loader"></div>
      <p>Loading map and data...</p>
    </div>
  {:else if error}
    <div class="error-container">
      <p>Error loading data: {error}</p>
      <button on:click={() => window.location.reload()}>Retry</button>
    </div>
  {:else}
    <div class="visualization-container">
      <div class="map-side">
        <DorchesterMap bind:this={dorchesterMapComponent} />
      </div>
      <div class="chart-side">
        <ScatterPlot />
      </div>
    </div>
  {/if}

  <div class="section-header">
    <h2 class="dorchester-findings">Findings</h2>
  </div>
  
  <div class="text-box-container">
    <div class="text-box">
      <p>Dorchester has one of the highest eviction rates in Boston. It contains more census tracts, where investors, especially large and institutional investors, are above the city average.</p>
    </div>
  
    <div class="text-box">
      <p>Investor rates differ across census tracts within Dorchester; several census tracts have extremely high institutional investor rates, while others have lower investor rates.</p>
    </div>
  
    <div class="text-box">
      <p>There is a significant correlation between investor rates and eviction rates. The trend is more evident for institutional investors and large investors.</p>
    </div>
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
  
  /* Adding the Dorchester section title color */
  .dorchester-title {
    color: #EEB0C2;
    font-size: 2rem; /* Pink color for Dorchester */
  }

  .dorchester-findings {
    color: #EEB0C2;
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
    background-color: #EEB0C2; /* Pink for Dorchester */
    color: black;
    border-color: #EEB0C2;
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
    border: 3px solid #EEB0C2;
    box-shadow: 6px 6px 0px #EEB0C2;
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
    border-top: 5px solid #EEB0C2; /* Pink for Dorchester */
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
  
  .error-container {
    background-color: #f8d7da;
    color: #721c24;
    padding: 20px;
    border-radius: 8px;
    margin: 20px auto;
    max-width: 800px;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    padding: 0 20px; /* Add padding to prevent text from touching edges on mobile */
  }
</style>