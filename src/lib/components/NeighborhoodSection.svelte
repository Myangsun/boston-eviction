<script>
  import { onMount } from 'svelte';
  import { selectedYear } from '$lib/stores.js';
  import DorchesterMap from '$lib/components/DorchesterMap.svelte';
  import ScatterPlot from '$lib/components/ScatterPlot.svelte';
  
  // Year selection
  let year;
  
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
</script>

<section id="neighborhood-section" class="section">
  <div class="section-header">
    <h2>Dorchester Neighborhood Analysis</h2>
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
      <DorchesterMap />
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
  
  .visualization-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .map-side, .chart-side {
    width: 100%;
  }
  
  .section-header {
    opacity: 1;
    transform: translateY(0);
  }
  
  .section-footer {
    margin-top: 2rem;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    opacity: 1;
    transform: translateY(0);
  }
  
  @media (max-width: 768px) {
    .visualization-container {
      grid-template-columns: 1fr;
    }
    
    .year-selector {
      flex-wrap: wrap;
    }
  }
</style>
