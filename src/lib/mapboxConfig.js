// Mapbox token configuration
// This approach allows us to use environment variables in development
// and fall back to a public token for GitHub Pages deployment
export const getMapboxToken = () => {
  // For GitHub Pages deployment, we use a public token with restricted usage
  const publicToken =
    "pk.eyJ1IjoibXN1bjE0IiwiYSI6ImNtOTNtYW4yaDBteGUya29od2tqMm1odHoifQ.HYIWpaywuH6qgAzS9wA7RA";

  // Check if we're in a development environment with environment variables
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.MAPBOX_TOKEN
  ) {
    return process.env.MAPBOX_TOKEN;
  }

  // For GitHub Pages deployment
  return publicToken;
};
