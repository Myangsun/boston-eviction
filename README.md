# Boston Eviction Visualization

This project visualizes the relationship between investor types and eviction rates in Boston census tracts. It uses SvelteKit, D3.js, and Mapbox GL to create an interactive, scrollytelling visualization.

## Features

- Interactive maps showing census tracts with investor density and eviction rates
- Scatter plots showing the relationship between investor types and eviction rates
- Year selection (2020-2023)
- Investor type filtering
- Smooth scrolling between sections
- Legends for both investor density and eviction rates

## Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your Mapbox token:
   ```
   VITE_MAPBOX_TOKEN=your_mapbox_token_here
   ```
4. Run the development server:
   ```
   npm run dev
   ```
5. Open your browser to http://localhost:5173/

## Data Files

The visualization uses two main data files:

- `public/data/processed_eviction_data.csv`: Contains eviction data and investor counts for each census tract
- `public/data/Metro_Boston_Census_Tracts.geojson`: Contains the geographic boundaries of census tracts

## GitHub Pages Deployment

To deploy this visualization to GitHub Pages:

1. Create a GitHub repository for your project
2. Add your Mapbox token as a repository secret named `MAPBOX_TOKEN`
3. Create a GitHub Actions workflow file at `.github/workflows/deploy.yml` with the following content:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: |
          echo "VITE_MAPBOX_TOKEN=${{ secrets.MAPBOX_TOKEN }}" > .env
          npm run build
      
      - name: Deploy to GitHub Pages
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          folder: build
```

4. Push your code to the repository
5. Enable GitHub Pages in your repository settings (Settings > Pages)
6. Set the source to "GitHub Actions"

## Project Structure

- `src/lib/components/`: Contains all visualization components
  - `TitleSection.svelte`: Title section with eviction notice image
  - `NeighborhoodSection.svelte`: Neighborhood-level visualization
  - `CitySection.svelte`: City-wide visualization
  - `DorchesterMap.svelte`: Map component for neighborhood section
  - `ScatterPlot.svelte`: Scatter plot component
- `src/lib/stores.js`: Svelte stores for state management
- `src/lib/mapboxConfig.js`: Mapbox token configuration
- `src/routes/+page.svelte`: Main page component
- `public/data/`: Data files (only contains the two required files)

## Visualization Details

- **Census Tract Fill**: Shows investor density with a color gradient from light pink to dark pink
- **Eviction Circles**: Black circles centered on each census tract, sized according to eviction rate
- **Legends**: Each map includes legends for both investor density and eviction rates
- **Interactive Elements**: Click on census tracts to highlight them in the scatter plot
- **Filtering**: Toggle between different investor types in the City view
