# GitHub Pages Deployment Instructions

This document provides instructions for deploying the Boston Eviction Visualization dashboard to GitHub Pages.

## Prerequisites

- A GitHub account
- Git installed on your local machine
- The built application files (already generated in the `build` directory)

## Deployment Steps

### 1. Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in to your account
2. Click on the "+" icon in the top right corner and select "New repository"
3. Name your repository (e.g., "boston-eviction-visualization")
4. Make the repository public
5. Click "Create repository"

### 2. Configure GitHub Pages

For a standard GitHub Pages deployment of a static site:

1. Push your code to the repository (see next section)
2. Go to your repository on GitHub
3. Click on "Settings"
4. Scroll down to the "GitHub Pages" section
5. Under "Source", select "main" branch and "/docs" folder
6. Click "Save"

### 3. Prepare Your Code for GitHub Pages

Since GitHub Pages requires the static files to be in either the root directory, a `/docs` folder, or a special `gh-pages` branch, you'll need to:

1. Rename the `build` directory to `docs`:
   ```
   mv build docs
   ```

2. Create a `.nojekyll` file in the `docs` directory to tell GitHub not to process the site with Jekyll:
   ```
   touch docs/.nojekyll
   ```

3. Create a simple redirect in the root `index.html` that points to the `docs` directory:
   ```html
   <!DOCTYPE html>
   <html>
     <head>
       <meta http-equiv="refresh" content="0; url=./docs/index.html">
     </head>
     <body>
       Redirecting to <a href="./docs/index.html">application</a>.
     </body>
   </html>
   ```

### 4. Push Your Code to GitHub

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit of Boston Eviction Visualization"

# Add remote repository (replace with your repository URL)
git remote add origin https://github.com/yourusername/boston-eviction-visualization.git

# Push to GitHub
git push -u origin main
```

### 5. Verify Deployment

1. Wait a few minutes for GitHub Pages to build your site
2. Visit `https://yourusername.github.io/boston-eviction-visualization/` to see your deployed application

## Troubleshooting

### Mapbox Token Issues

If the maps don't load on GitHub Pages:

1. Create a `.env` file in your local repository with your Mapbox token:
   ```
   MAPBOX_TOKEN=your_mapbox_token_here
   ```

2. Update the `mapboxConfig.js` file to use a different public token if needed.

### Path Issues

If resources aren't loading correctly:

1. Check that all paths in the application are relative, not absolute
2. Update the `base` path in `svelte.config.js` if deploying to a subdirectory:
   ```js
   kit: {
     adapter: adapter(),
     paths: {
       base: '/boston-eviction-visualization'
     }
   }
   ```

3. Rebuild the application and redeploy

### CORS Issues

If you encounter CORS issues with data loading:

1. Make sure all data files are included in the repository
2. Check that data files are being loaded with relative paths
3. Consider using GitHub's raw content URLs if needed
