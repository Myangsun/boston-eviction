<script>
  import { onMount } from 'svelte';
  import { selectedYear } from '$lib/stores.js';
  import BackbayMap from '$lib/components/BackbayMap.svelte';
  import ScatterPlot2 from '$lib/components/ScatterPlot2.svelte';
  
  // Year selection
  let year;
  
  // Reference to the BackbayMap component
  let backbayMapComponent;
  
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
  
  // Export the refreshBackbayMap function for external access
  export function refreshBackbayMap() {
    if (backbayMapComponent && typeof backbayMapComponent.refreshBackbayMap === 'function') {
      backbayMapComponent.refreshBackbayMap();
    }
  }
</script>

<section id="neighborhood2-section" class="section">
  <div class="section-header">
    <h2 class="backbay-title">Back Bay Neighborhood Analysis</h2>
    <p>Does the cost of rent and the profit from property flipping indicate eviction risk in Back Bay?</p>
  </div>
  
  <div class="year-selector">
    <button class:active={year === '2020'} on:click={() => setYear('2020')}>2020</button>
    <button class:active={year === '2021'} on:click={() => setYear('2021')}>2021</button>
    <button class:active={year === '2022'} on:click={() => setYear('2022')}>2022</button>
    <button class:active={year === '2023'} on:click={() => setYear('2023')}>2023</button>
  </div>
  
  <div class="visualization-container">
    <div class="map-side">
      <BackbayMap bind:this={backbayMapComponent} />
    </div>
    <div class="chart-side">
      <ScatterPlot2 />
    </div>
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
    background-color: #88e4cc;
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
  justify-content: center;
  gap: 3rem;
  margin-top: 3rem;
  flex-wrap: wrap; 
  }

  .text-box {
    border: 3px solid #88e4cc;
    box-shadow: 6px 6px 0px #88e4cc;
    padding: 1.5rem;
    max-width: 300px;
    min-height: 240px;
    color: #88e4cc;
    font-weight: 600;
    font-size: 1.2rem;
    line-height: 1.5;
  }
</style>