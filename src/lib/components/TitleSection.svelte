<script>
  import { onMount } from 'svelte';
  
  let titleImage;
  
  onMount(() => {
    console.log("TitleSection component mounted");
  });
</script>

<section id="title-section" class="section">
  <div class="title-container">
    <div class="image-container">
      <img 
        src="./Title.png" 
        alt="Eviction Notice" 
        bind:this={titleImage}
        on:error={(e) => console.error("Error loading title image:", e)}
      />
    </div>
    <h1>404 Housing Not Found</h1>
    <p class="subtitle">Tracing the impact of property investment on eviction in Boston</p>
    <div class="scroll-indicator">
      <p>Scroll to explore</p>
      <div class="arrow-down">↓</div>
    </div>
  </div>
</section>

<style>
  .title-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .image-container {
    margin-bottom: 2rem;
    max-width: 400px;
  }
  
  img {
    width: 100%;
    height: auto;
  }
  
  h1 {
    font-size: 3.5rem;
    margin-bottom: 1rem;
    color: var(--primary-color);
  }
  
  .subtitle {
    font-size: 1.5rem;
    color: #666;
    margin-bottom: 3rem;
  }
  
  .scroll-indicator {
    margin-top: 4rem;
    opacity: 0.7;
    animation: bounce 2s infinite;
  }
  
  .arrow-down {
    font-size: 2rem;
    margin-top: 0.5rem;
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-10px);
    }
    60% {
      transform: translateY(-5px);
    }
  }
  
  @media (max-width: 768px) {
    h1 {
      font-size: 2.5rem;
    }
    
    .subtitle {
      font-size: 1.2rem;
    }
  }
</style>
