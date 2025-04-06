<script>
  import '../app.css';
</script>

<slot />

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    overflow-x: hidden;
  }
  
  :global(*) {
    box-sizing: border-box;
  }
</style>
