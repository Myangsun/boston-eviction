<script>
  import { onMount } from 'svelte';
  import { loadData, evictionData, boundaryData, activeSection, scrollProgress } from '$lib/stores.js';
  import TitleSection from '$lib/components/TitleSection.svelte';
  import NeighborhoodSection from '$lib/components/NeighborhoodSection.svelte';
  import NeighborhoodSection2 from '$lib/components/NeighborhoodSection2.svelte';
  import CitySection from '$lib/components/CitySection.svelte';
  
  let dataLoaded = false;
  let error = null;
  
  // Load data on component mount
  onMount(async () => {
    try {
      console.log("Loading data...");
      
      // Use the loadData function from stores.js to ensure consistent data processing
      const success = await loadData();
      
      if (!success) {
        throw new Error("Failed to load data");
      }
      
      dataLoaded = true;
      
      // Set up scrolling observer
      setupScrollObserver();
      
      // Set up scroll progress tracking
      setupScrollProgress();
    } catch (err) {
      console.error('Error loading data:', err);
      error = err.message;
    }
  });
  
  // Set up intersection observer for scrollytelling
  function setupScrollObserver() {
    const sections = document.querySelectorAll('.section');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          activeSection.set(id.replace('-section', ''));
          
          // Add animation class to visible elements
          const animateElements = entry.target.querySelectorAll('.should-animate');
          animateElements.forEach(el => {
            el.classList.add('animate-in');
          });
        }
      });
    }, { threshold: 0.5 });
    
    sections.forEach(section => {
      observer.observe(section);
    });
  }
  
  // Set up scroll progress tracking
  function setupScrollProgress() {
    window.addEventListener('scroll', () => {
      const windowHeight = window.innerHeight;
      const fullHeight = document.body.scrollHeight;
      const scrolled = window.scrollY;
      
      const progress = Math.min(scrolled / (fullHeight - windowHeight), 1);
      scrollProgress.set(progress);
    });
  }
  
  // Handle scroll indicator click
  function scrollToNextSection() {
    const sections = document.querySelectorAll('.section');
    let currentSectionIndex = 0;
    
    // Find current section
    sections.forEach((section, index) => {
      if (section.id.includes($activeSection)) {
        currentSectionIndex = index;
      }
    });
    
    // Scroll to next section if available
    if (currentSectionIndex < sections.length - 1) {
      sections[currentSectionIndex + 1].scrollIntoView({ behavior: 'smooth' });
    }
  }
</script>

{#if error}
  <div class="error">
    <h2>Error loading data</h2>
    <p>{error}</p>
  </div>
{:else if !dataLoaded}
  <div class="loading">
    <h2>Loading data...</h2>
    <p>Please wait while we load the visualization data.</p>
  </div>
{:else}
  <main>
    <TitleSection />
    
    <NeighborhoodSection />
    
    <NeighborhoodSection2 />
    
    <CitySection />
    
    <div class="scroll-progress-bar">
      <div class="progress-indicator" style="width: {$scrollProgress * 100}%"></div>
    </div>
    
    <div class="scroll-progress-dots">
      <div class="progress-dot" class:active={$activeSection === 'title'} 
           on:click={() => document.getElementById('title-section').scrollIntoView({ behavior: 'smooth' })}
           role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && document.getElementById('title-section').scrollIntoView({ behavior: 'smooth' })}>
        <span class="dot-label">Title</span>
      </div>
      <div class="progress-line"></div>
      <div class="progress-dot" class:active={$activeSection === 'neighborhood'} 
           on:click={() => document.getElementById('neighborhood-section').scrollIntoView({ behavior: 'smooth' })}
           role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && document.getElementById('neighborhood-section').scrollIntoView({ behavior: 'smooth' })}>
        <span class="dot-label">Neighborhood</span>
      </div>
      <div class="progress-dot" class:active={$activeSection === 'neighborhood2'} 
            on:click={() => document.getElementById('neighborhood2-section').scrollIntoView({ behavior: 'smooth' })}
            role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && document.getElementById('neighborhood2-section').scrollIntoView({ behavior: 'smooth' })}>
        <span class="dot-label">Neighborhood2</span>
      </div>
      <div class="progress-line"></div>
      <div class="progress-dot" class:active={$activeSection === 'city'} 
           on:click={() => document.getElementById('city-section').scrollIntoView({ behavior: 'smooth' })}
           role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && document.getElementById('city-section').scrollIntoView({ behavior: 'smooth' })}>
        <span class="dot-label">City</span>
      </div>
    </div>
  </main>
{/if}

<style>
  main {
    width: 100%;
    overflow-x: hidden;
    position: relative;
  }
  
  .loading, .error {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 2rem;
  }
  
  .error {
    color: var(--primary-color);
  }
  
  .scroll-progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background-color: rgba(0, 0, 0, 0.1);
    z-index: 1000;
  }
  
  .progress-indicator {
    height: 100%;
    background-color: var(--primary-color);
    width: 0%;
    transition: width 0.1s ease;
  }
  
  .scroll-progress-dots {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 100;
  }
  
  .progress-dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background-color: white;
    border: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: bold;
    transition: all 0.3s ease;
    cursor: pointer;
    position: relative;
  }
  
  .progress-dot.active {
    background-color: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
    transform: scale(1.2);
  }
  
  .dot-label {
    position: absolute;
    right: 40px;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.3s ease;
    background-color: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
  }
  
  .progress-dot:hover .dot-label {
    opacity: 1;
  }
  
  .progress-line {
    width: 2px;
    height: 40px;
    background-color: var(--border-color);
  }
  
  @media (max-width: 768px) {
    .scroll-progress-dots {
      display: none;
    }
  }
</style>
