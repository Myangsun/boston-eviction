<script>
  import { page } from '$app/stores';
</script>

<div class="error-container">
  <h1>Error {$page.status}</h1>
  <p class="error-message">{$page.error?.message || 'Something went wrong'}</p>
  <p>Please try refreshing the page. If the problem persists, check the console for more details.</p>
  <a href="/">Return to home page</a>
</div>

<style>
  .error-container {
    max-width: 800px;
    margin: 100px auto;
    padding: 2rem;
    text-align: center;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .error-message {
    font-size: 1.2rem;
    margin-bottom: 2rem;
    padding: 1rem;
    border-radius: 4px;
    background-color: #f8d7da;
    color: #721c24;
  }
  
  a {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background-color: #007bff;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
  }
  
  a:hover {
    background-color: #0069d9;
  }
</style>
