<script>
  import { onMount } from "svelte";
  import {
    loadData,
    evictionData,
    boundaryData,
    activeSection,
    scrollProgress,
    dorchesterSelectedTracts,
    backbaySelectedTracts,
    dataLoading,
    dataLoadError,
  } from "$lib/stores.js";
  import TitleSection from "$lib/components/TitleSection.svelte";
  import NeighborhoodSection from "$lib/components/NeighborhoodSection.svelte";
  import NeighborhoodSection2 from "$lib/components/NeighborhoodSection2.svelte";
  import CitySection from "$lib/components/CitySection.svelte";
  import StoryBackbay from "$lib/components/StoryBackbay.svelte";
  import StoryDorchester from "$lib/components/StoryDorchester.svelte";

  let loaded = false;
  let backbayMapComponent;
  let dorchesterMapComponent;

  // Use unique variable names to avoid conflicts
  let isLoading;
  let loadError;

  // Subscribe to the stores to track loading state
  const unsubscribeLoading = dataLoading.subscribe(value => {
    isLoading = value;
  });
  
  const unsubscribeError = dataLoadError.subscribe(value => {
    loadError = value;
  });

  onMount(async () => {
    try {
      // Try to load data
      const success = await loadData();
      if (!success && !loadError) {
        // Only set error if not already set by the store
        dataLoadError.set("Failed to load required data. Please check your connection and try again.");
      }
    setupScrollProgress();
    setupScrollObserver();
    } catch (e) {
      console.error("Error during data loading:", e);
      dataLoadError.set(e.message || "An unexpected error occurred while loading data.");
    }

    return () => {
      // Clean up subscriptions when component is destroyed
      unsubscribeLoading();
      unsubscribeError();
    };
  });

  // Set up intersection observer for scrollytelling
  function setupScrollObserver() {
    const sections = document.querySelectorAll(".section");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            activeSection.set(id.replace("-section", ""));

            // Add animation class to visible elements
            const animateElements =
              entry.target.querySelectorAll(".should-animate");
            animateElements.forEach((el) => {
              el.classList.add("animate-in");
            });
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach((section) => {
      observer.observe(section);
    });
  }

  // Set up scroll progress tracking
  function setupScrollProgress() {
    window.addEventListener("scroll", () => {
      const windowHeight = window.innerHeight;
      const fullHeight = document.body.scrollHeight;
      const scrolled = window.scrollY;

      const progress = Math.min(scrolled / (fullHeight - windowHeight), 1);
      scrollProgress.set(progress);
    });
  }

  // Handle scroll indicator click
  function scrollToNextSection() {
    const sections = document.querySelectorAll(".section");
    let currentSectionIndex = 0;

    // Find current section
    sections.forEach((section, index) => {
      if (section.id.includes($activeSection)) {
        currentSectionIndex = index;
      }
    });

    // Scroll to next section if available
    if (currentSectionIndex < sections.length - 1) {
      sections[currentSectionIndex + 1].scrollIntoView({ behavior: "smooth" });
    }
  }

  // Reset the specific neighborhood selection when switching sections
  function handleSectionChange(newSection) {
    console.log("Section changed to:", newSection);
    const previousSection = $activeSection;
    activeSection.set(newSection);

    // When entering a neighborhood section, make sure to initialize its selections
    if (newSection === "neighborhood") {
      console.log("Entering Dorchester section, refreshing map");
      // Clear Back Bay selections completely to avoid interference
      backbaySelectedTracts.set([]);

      // Force a robust refresh of the Dorchester map when entering this section
      if (
        dorchesterMapComponent &&
        typeof dorchesterMapComponent.refreshDorchesterMap === "function"
      ) {
        // Give the UI a chance to update first
        setTimeout(() => {
          console.log("Calling refreshDorchesterMap");
          dorchesterMapComponent.refreshDorchesterMap();

          // Try refreshing again after a delay to make sure it takes effect
          setTimeout(() => {
            console.log("Second attempt at refreshDorchesterMap");
            dorchesterMapComponent.refreshDorchesterMap();
          }, 500);
        }, 100);
      }
    } else if (newSection === "neighborhood2") {
      console.log("Entering Back Bay section, refreshing map");
      // Clear Dorchester selections completely to avoid interference
      dorchesterSelectedTracts.set([]);

      // Force a refresh of the Back Bay map when entering this section
      if (
        backbayMapComponent &&
        typeof backbayMapComponent.refreshBackbayMap === "function"
      ) {
        setTimeout(() => {
          console.log("Calling refreshBackbayMap");
          backbayMapComponent.refreshBackbayMap();
        }, 100);
      }
    }
  }

  // Update the section detection logic to call the new handler
  function updateSectionVisibility() {
    // ...existing section detection code...

    if (currentSection !== $activeSection) {
      handleSectionChange(currentSection);
    }
  }

  // Add a function to handle exiting the StoryBackbay section
  function handleStoryBackbayExit(event) {
    // If the exit direction is 'bottom', scroll to the next section
    if (event.detail.direction === "bottom") {
      document
        .getElementById("neighborhood2-section")
        .scrollIntoView({ behavior: "smooth" });
    }
    // If the exit direction is 'top', scroll to the previous section
    else if (event.detail.direction === "top") {
      document
        .getElementById("neighborhood-section")
        .scrollIntoView({ behavior: "smooth" });
    }
  }
  // Add a function to handle exiting the StoryBackbay section
  function handleStoryDorchesterExit(event) {
    // If the exit direction is 'bottom', scroll to the next section
    if (event.detail.direction === "bottom") {
      document
        .getElementById("neighborhood-section")
        .scrollIntoView({ behavior: "smooth" });
    }
    // If the exit direction is 'top', scroll to the previous section
    else if (event.detail.direction === "top") {
      document
        .getElementById("title-section")
        .scrollIntoView({ behavior: "smooth" });
    }
  }
</script>

{#if isLoading}
  <div class="loading-container">
    <div class="loader"></div>
    <p>Loading data, please wait...</p>
  </div>
{:else if loadError}
  <div class="error-container">
    <h2>Data Loading Error</h2>
    <p>{loadError}</p>
    <button on:click={() => window.location.reload()}>Retry</button>
  </div>
{:else}
  <main>
    <TitleSection />

    <!-- Simply add a section ID to help with navigation -->
    <section id="story-dorchester-section" class="section">
      <StoryDorchester />
    </section>

    <NeighborhoodSection bind:this={dorchesterMapComponent} />

    <!-- Simply add a section ID to help with navigation -->
    <section id="story-backbay-section" class="section">
      <StoryBackbay />
    </section>

    <NeighborhoodSection2 bind:this={backbayMapComponent} />
    <CitySection />

    <div class="scroll-progress-bar">
      <div
        class="progress-indicator"
        style="width: {$scrollProgress * 100}%"
      ></div>
    </div>

    <div class="scroll-progress-dots">
      <div
        class="progress-dot"
        class:active={$activeSection === "title"}
        on:click={() =>
          document
            .getElementById("title-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("title-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
        <span class="dot-label">Title</span>
      </div>
      <div class="progress-line"></div>
      <div
        class="progress-dot"
        class:active={$activeSection === "Dorchester Story"}
        on:click={() =>
          document
            .getElementById("story-dorchester-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("story-dorchester-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
        <span class="dot-label">Dorchester Story</span>
      </div>
      <div
        class="progress-dot"
        class:active={$activeSection === "neighborhood"}
        on:click={() =>
          document
            .getElementById("neighborhood-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("neighborhood-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
        <span class="dot-label">Dorchester Analysis</span>
      </div>
      <div class="progress-line"></div>
      <div
        class="progress-dot"
        class:active={$activeSection === "Back Bay Story"}
        on:click={() =>
          document
            .getElementById("story-backbay-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("story-backbay-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
        <span class="dot-label">Back Bay Story</span>
      </div>
      <div
        class="progress-dot"
        class:active={$activeSection === "neighborhood2"}
        on:click={() =>
          document
            .getElementById("neighborhood2-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("neighborhood2-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
        <span class="dot-label">Back Bay Analysis</span>
      </div>
      <div class="progress-line"></div>
      <div
        class="progress-dot"
        class:active={$activeSection === "city"}
        on:click={() =>
          document
            .getElementById("city-section")
            .scrollIntoView({ behavior: "smooth" })}
        role="button"
        tabindex="0"
        on:keydown={(e) =>
          e.key === "Enter" &&
          document
            .getElementById("city-section")
            .scrollIntoView({ behavior: "smooth" })}
      >
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

  .loading-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    text-align: center;
    padding: 2rem;
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

  .error-container {
    max-width: 600px;
    margin: 100px auto;
    padding: 20px;
    background-color: #f8d7da;
    color: #721c24;
    border-radius: 4px;
    text-align: center;
  }

  .error-container button {
    margin-top: 20px;
    padding: 8px 16px;
    background-color: #721c24;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    width: 100%;
  }

  .loader {
    border: 6px solid #f3f3f3;
    border-top: 6px solid #3498db;
    border-radius: 50%;
    width: 60px;
    height: 60px;
    animation: spin 2s linear infinite;
    margin-bottom: 20px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
