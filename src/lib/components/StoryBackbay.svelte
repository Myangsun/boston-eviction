<script>
    import { onMount, onDestroy } from 'svelte';
    
    // Story data with 6 scenes
    const storyScenes = [
      {
        background: './images/backbay-1.png',
        text: "I thought this neighborhood would be safe. I didn't expect to lose my home this way.<br> — Natalie L., renter in Back Bay since 2016",
        hasPlot: false
      },
      {
        background: './images/backbay-2.png',
        text: 'Her vision of a stable home fractures, undone by the steady climb of cost.',
        hasPlot: false
      },
      {
        background: './images/backbay-2.png',
        text: '67% of eviction filings in Back Bay are for non-payment. The rent burden weighs heavily, not just on Natalie.',
        hasPlot: false
      },
      {
        background: './images/backbay-3.png',
        text: 'In the past twenty years, Back Bay has experienced a constant growth in investor-type transactions.',
        hasPlot: true,
        plotImage: './images/backbay-plot1.png'
      },
      {
        background: './images/backbay-3.png',
        text: 'Housing as an investment is fueled by increasing returns from property flipping.',
        hasPlot: true,
        plotImage: './images/backbay-plot2.png'
      },
      {
        background: './images/backbay-6.png',
        hasPlot: false,
        isSpecial: true,
        specialImage: './images/backbay-sign.png'
        },
    ];
    
    let currentScene = 0;
    let container;
    let observer;
    let scrollProgress = 0;
    let isInViewport = false;
    
    onMount(() => {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          isInViewport = entry.isIntersecting;
          
          if (entry.isIntersecting) {
            window.addEventListener('scroll', handleScroll);
          } else {
            window.removeEventListener('scroll', handleScroll);
          }
        },
        { threshold: 0.1 }
      );
      
      if (container) {
        observer.observe(container);
      }
    });
    
    onDestroy(() => {
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener('scroll', handleScroll);
    });
    
    function handleScroll() {
      if (!container || !isInViewport) return;
      
      // Get container position
      const rect = container.getBoundingClientRect();
      const totalHeight = container.offsetHeight;
      const viewportHeight = window.innerHeight;
      
      // Calculate scroll progress (0 to 1)
      const totalScrollable = totalHeight - viewportHeight;
      const scrolled = -rect.top;
      scrollProgress = Math.max(0, Math.min(1, scrolled / totalScrollable));
      
      // Calculate which scene to show (0 to 5)
      const numScenes = storyScenes.length;
      currentScene = Math.min(Math.floor(scrollProgress * numScenes), numScenes - 1);
    }
    
    // Calculate the progress within the current scene (0 to 1)
    $: sceneProgress = (scrollProgress * storyScenes.length) % 1;
    
    // For scene 6, calculate the position based on progress
    // From bottom to middle (50% of the way up)
    $: specialPosition = sceneProgress < 0.5 
      ? 100 - (sceneProgress * 200) // Move from bottom to middle
      : 0; // Stay in the middle once it gets there
  </script>
  
  <div class="story-container" bind:this={container}>
    {#if isInViewport}
      <div class="fixed-background-container">
        {#each storyScenes as scene, i}
          <div 
            class="background" 
            style="background-image: url({scene.background});"
            class:active={currentScene === i}
          ></div>
        {/each}
      </div>
      <div class="fixed-footer">
        <p>*This is a fictional story that draws from real data. </p>
      </div>
    {/if}
  
    <!-- Scroll container (this is what actually scrolls) -->
    <div class="scroll-container">
      {#each storyScenes as scene, i}
        <div class="scene-section">
          {#if i === currentScene && isInViewport}
            {#if scene.isSpecial}
              <!-- Special scene with moving image that stops in the middle -->
              <div class="special-image-container">
                <img 
                  src={scene.specialImage} 
                  alt="rent control" 
                  class="special-image"
                />
              </div>
            {:else}
              <!-- Normal text boxes for other scenes -->
              <div 
                class="text-box {scene.hasPlot ? 'with-plot' : ''}"
                style="transform: translateY({100 - (sceneProgress * 100)}%);"
              >
                {#if scene.hasPlot}
                  <!-- Combined plot and text container -->
                  <div class="plot-text-container">
                    <img 
                      src={scene.plotImage} 
                      alt="Data visualization" 
                      class="plot-image"
                    />
                    <p class="quote">
                      {@html scene.text}
                    </p>
                  </div>
                {:else}
                  <!-- Regular quote box -->
                  <div class="quote-container">
                    <p class="quote">
                      {@html scene.text}
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
  
  <style>
    .story-container {
      position: relative;
      width: 100%;
      height: 600vh; /* Height for 6 scenes */
    }
    
    /* Fixed background that doesn't move */
    .fixed-background-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      z-index: 1;
    }
    
    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-size: contain; 
      background-repeat: no-repeat;
      background-position: center;
      opacity: 0;
      transition: opacity 0.8s ease;
    }
    
    .background.active {
      opacity: 1;
    }
    
    /* Scrollable container */
    .scroll-container {
      position: relative;
      width: 100%;
      height: 600vh;
      z-index: 2;
      pointer-events: none; /* Let clicks pass through to elements below */
    }
    
    .scene-section {
      position: relative;
      height: 100vh;
    }
    
    /* Base text box styling */
    .text-box {
      position: absolute;
      bottom: 10%;
      left: 5%;
      width: 470px;
      padding: 20px;
      background: white;
      border: 3px solid #00D098; /* green border */
      box-shadow: 5px 5px 0 #00D098; /* green shadow "offset" */
      line-height: 1.4;
      pointer-events: auto;
      transform: translateY(100%);
      transition: transform 0.2s ease-out;
    }
    
    .quote {
      font-family: 'Inter', sans-serif;
      font-weight: 700; /* Bold */
      font-size: 1.3125rem; /* 21px */
      line-height: 1.6;
      color: #00D098;
      margin: 0 0 0.5rem 0;
    }
    
    .plot-image {
      width: 100%;
      height: auto;
      display: block;
      margin-bottom: 1rem;
    }
    
    /* Special image for scene 6 */
    .special-image-container {
        position: sticky;
        top: 80%;
        width: 100%;
        max-width: 1000px;
        text-align: center;

        transition: transform 0.8s ease-out;
        pointer-events: auto;
        z-index: 1;
    }

    
    .special-image {
      width: 80%;
      height: auto;
      margin-bottom: 1rem;
      margin-left: 40% ;
    }
    
    
    @media (max-width: 768px) {
      .text-box {
        width: 85%;
        max-width: 400px;
      }
      
      .special-image-container {
        width: 90%;
      }
  
      
      .quote {
        font-size: 1.1rem;
      }
    }
      .fixed-footer {
        font-family: 'Inter', sans-serif;
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.9rem;
        color: rgba(150, 150, 150, 0.8);
        z-index: 3;
        width: 100%;
        text-align: center;
        pointer-events: none;
    }
  </style>