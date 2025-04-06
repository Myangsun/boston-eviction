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
