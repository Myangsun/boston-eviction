<script>
  import { onMount } from 'svelte';
  import { selectedYear } from '$lib/stores.js';
  import DorchesterMap from '$lib/components/DorchesterMap.svelte';
  import ScatterPlot from '$lib/components/ScatterPlot.svelte';
  
  // Year selection
  let year;
  
  // Reference to the DorchesterMap component
  let dorchesterMapComponent;
  
  const unsubscribeYear = selectedYear.subscribe(value => {
    year = value;
  });
  
  function setYear(newYear) {
    selectedYear.set(newYear);
  }
  
  onMount(() => {
    // Cleanup on component destroy
    return () => {
      unsubscribeYear();
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
  
  <div class="visualization-container">
    <div class="map-side">
      <DorchesterMap bind:this={dorchesterMapComponent} />
    </div>
    <div class="chart-side">
      <ScatterPlot />
    </div>
  </div>
  
  <div class="section-footer">
    <p>Click on census tracts in the map to highlight them in the scatter plot. Use the buttons above to change the year and investor type.</p>
    <p>The data reveals a correlation between areas with high investor ownership and increased eviction rates, particularly in the most recent years.</p>
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
    color: #EEB0C2; /* Pink color for Dorchester */
  }
  
  /* Style the year selector buttons */
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
  
  .section-footer {
    margin-top: 2rem;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    padding: 0 20px; /* Add padding to prevent text from touching edges on mobile */
  }
</style>