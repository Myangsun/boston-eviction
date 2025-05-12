<script>
  import { onMount } from "svelte";
  import mapboxgl from "mapbox-gl";
  import {
    evictionData,
    boundaryData,
    visibleLayers,
    selectedYear,
    dataScales,
    censusData,
  } from "$lib/stores.js";
  import { getMapboxToken } from "$lib/mapboxConfig.js";

  let mapContainer;
  let map;
  let legend;

  // Reactive state
  let layers = {};
  let year;
  let data = [];
  let boundaries = {};
  let scales = { maxInvestorCount: 0, maxEvictionRate: 0 };
  let census = [];

  // Subscriptions
  const unsubscribeVisibleLayers = visibleLayers.subscribe((value) => {
    layers = value;
    if (map) updateMapLayers();
  });
  const unsubscribeYear = selectedYear.subscribe((value) => {
    year = value;
    if (map) updateMapLayers();
  });
  const unsubscribeEvictionData = evictionData.subscribe((value) => {
    data = value;
    if (map) updateMapLayers();
  });
  const unsubscribeBoundaryData = boundaryData.subscribe((value) => {
    boundaries = value;
    if (map) updateMapLayers();
  });
  const unsubscribeDataScales = dataScales.subscribe((value) => {
    scales = value;
    if (map) updateMapLayers();
  });
  const unsubscribeCensus = censusData.subscribe((value) => {
    census = value;
    if (map) updateMapLayers();
  });

  onMount(() => {
    // Initialize Mapbox map
    const mapboxToken = getMapboxToken();
    mapboxgl.accessToken = mapboxToken;
    map = new mapboxgl.Map({
      container: mapContainer,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-71.06, 42.31],
      zoom: 11,
      minZoom: 9,
      maxZoom: 15,
      interactive: true,
    });

    legend = document.createElement("div");
    legend.className = "map-legend";
    mapContainer.appendChild(legend);

    map.on("load", () => {
      initializeMapLayers();

      map.on("mouseenter", "boston-fill", (e) => {
        if (e.features.length) {
          const f = e.features[0];
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            // <p>GEOID: ${f.properties.tract_id}</p>
            //<h4>Census Tract</h4>
            .setHTML(
              `
               <p><strong>${layers.institutional ? "Institutional" : ""}${layers.large ? "Large" : ""}${layers.medium ? "Medium" : ""}${layers.small ? "Small" : ""}</strong> Investors: ${f.properties.investor_count || ""}</p>
               <p><strong>Eviction Rate (${year}):</strong> ${((f.properties.eviction_rate || 0) * 100).toFixed(1)}%</p>`
            )
            .addTo(map);
        }
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "boston-fill", () => {
        map.getCanvas().style.cursor = "";
        const popups = document.getElementsByClassName("mapboxgl-popup");
        if (popups.length) popups[0].remove();
      });
    });

    map.on("error", (e) => console.error("City map error:", e));

    return () => {
      unsubscribeVisibleLayers();
      unsubscribeYear();
      unsubscribeEvictionData();
      unsubscribeBoundaryData();
      unsubscribeDataScales();
      unsubscribeCensus();
      if (map) map.remove();
      if (legend && legend.parentNode) legend.parentNode.removeChild(legend);
    };
  });

  function initializeMapLayers() {
    if (!map.getSource("boston-data")) {
      map.addSource("boston-data", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "boston-fill",
        type: "fill",
        source: "boston-data",
        paint: { "fill-color": "#ccc", "fill-opacity": 0.7 },
        filter: ["==", "$type", "Polygon"],
      });
      map.addLayer({
        id: "boston-evictions",
        type: "circle",
        source: "boston-data",
        paint: { "circle-color": "black", "circle-opacity": 0.6 },
        layout: { visibility: "visible" },
        filter: ["==", "$type", "Point"],
      });
    }
    updateMapLayers();
  }

  function updateMapLayers() {
    if (!map || !map.getSource("boston-data")) return;
    if (!data.length || !boundaries.features) return;

    // If a demographic button is active, draw demographic %
    const demographicType = [
      "white",
      "black",
      "hispanic",
      "asian",
      "other",
    ].find((d) => layers[d]);
    if (demographicType) {
      const features = boundaries.features.flatMap((bf) => {
        const tractId = bf.properties.geoid;
        const c = census.find((c) => c.GEOID === tractId);
        if (!c) return [];
        const pop = +c.pop || 0;
        let demCount = 0;
        switch (demographicType) {
          case "white":
            demCount = +c.nhwhi;
            break;
          case "black":
            demCount = +c.nhaa;
            break;
          case "asian":
            demCount = +c.nhas;
            break;
          case "other":
            demCount = +c.nhoth;
            break;
          case "hispanic":
            demCount =
              pop -
              (+c.nhwhi +
                +c.nhaa +
                +c.nhna +
                +c.nhas +
                +c.nhpi +
                +c.nhoth +
                +c.nhmlt);
            break;
        }
        const demPct = pop > 0 ? demCount / pop : 0;
        const tractRec = data.find((d) => d.GEOID === tractId);
        const evictionRate = tractRec
          ? +tractRec[`eviction_rate_${year}`] || 0
          : 0;

        const out = [
          {
            type: "Feature",
            geometry: bf.geometry,
            properties: {
              tract_id: tractId,
              dem_pct: demPct,
              eviction_rate: evictionRate,
            },
          },
        ];
        if (layers.evictions) {
          out.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: calculateCentroid(bf.geometry),
            },
            properties: {
              tract_id: tractId,
              dem_pct: demPct,
              eviction_rate: evictionRate,
            },
          });
        }
        return out;
      });

      map
        .getSource("boston-data")
        .setData({ type: "FeatureCollection", features });
      map.setPaintProperty("boston-fill", "fill-color", [
        "interpolate",
        ["linear"],
        ["get", "dem_pct"],
        0,
        "#fff5eb", // very light orange
        0.25,
        "#ffd8b1",
        0.5,
        "#ffb97a",
        0.75,
        "#ff9a44",
        1.0,
        "#ff7b00", // darkest orange
      ]);

      updateLegend(demographicType);
      map.setLayoutProperty(
        "boston-evictions",
        "visibility",
        layers.evictions ? "visible" : "none"
      );
      return;
    }

    // Otherwise, draw investor counts as before
    const features = [];
    const invType =
      Object.keys(layers).find(
        (k) =>
          layers[k] && ["institutional", "large", "medium", "small"].includes(k)
      ) || "institutional";
    data.forEach((t) => {
      const bf = boundaries.features.find(
        (f) => f.properties.geoid === t.GEOID
      );
      if (!bf) return;
      if (
        Object.keys(layers).some(
          (k) =>
            layers[k] &&
            ["institutional", "large", "medium", "small"].includes(k) &&
            +t[`sum_${k}_investor`] > 0
        )
      ) {
        const invCount = +t[`sum_${invType}_investor`] || 0;
        const evRate = +t[`eviction_rate_${year}`] || 0;
        features.push({
          type: "Feature",
          geometry: bf.geometry,
          properties: {
            tract_id: t.GEOID,
            investor_count: invCount,
            eviction_rate: evRate,
          },
        });
        if (layers.evictions) {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: calculateCentroid(bf.geometry),
            },
            properties: {
              tract_id: t.GEOID,
              investor_count: invCount,
              eviction_rate: evRate,
            },
          });
        }
      }
    });
    map
      .getSource("boston-data")
      .setData({ type: "FeatureCollection", features });

    // update investor color ramp
    if (scales.maxInvestorCount) {
      map.setPaintProperty("boston-fill", "fill-color", [
        "interpolate",
        ["linear"],
        ["get", "investor_count"],
        0,
        "#fae8ee",
        scales.maxInvestorCount * 0.25,
        "#f8d0db",
        scales.maxInvestorCount * 0.5,
        "#EEB0C2",
        scales.maxInvestorCount * 0.75,
        "#d4899e",
        scales.maxInvestorCount,
        "#c06c84",
      ]);
    }
    if (scales.maxEvictionRate) {
      map.setPaintProperty("boston-evictions", "circle-radius", [
        "interpolate",
        ["linear"],
        ["get", "eviction_rate"],
        0,
        5,
        scales.maxEvictionRate * 0.25,
        10,
        scales.maxEvictionRate * 0.5,
        15,
        scales.maxEvictionRate * 0.75,
        20,
        scales.maxEvictionRate,
        25,
      ]);
    }
    updateLegend(invType);
    map.setLayoutProperty(
      "boston-evictions",
      "visibility",
      layers.evictions ? "visible" : "none"
    );
  }

  function calculateCentroid(geometry) {
    if (geometry.type === "Polygon") {
      const coords = geometry.coordinates[0];
      const sum = coords.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1]],
        [0, 0]
      );
      return [sum[0] / coords.length, sum[1] / coords.length];
    }
    if (geometry.type === "MultiPolygon") {
      const coords = geometry.coordinates[0][0];
      const sum = coords.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1]],
        [0, 0]
      );
      return [sum[0] / coords.length, sum[1] / coords.length];
    }
    return [-71.06, 42.31];
  }

  function updateLegend(mode) {
    if (["white", "black", "hispanic", "asian", "other"].includes(mode)) {
      const title =
        mode.charAt(0).toUpperCase() + mode.slice(1) + " Population %";
      legend.innerHTML = `
  <div class="legend-title">${title}</div>
  <div class="legend-scale">
    <div class="legend-item">
      <div class="legend-color" style="background-color:#fff5eb"></div>
      <div class="legend-label">0%</div>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background-color:#ffb97a"></div>
      <div class="legend-label">50%</div>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background-color:#ff7b00"></div>
      <div class="legend-label">100%</div>
    </div>
  </div>
  <!-- … rest of the legend_html … -->
`;

      return;
    }
    const investorTitle =
      mode.charAt(0).toUpperCase() + mode.slice(1) + " Investors";
    legend.innerHTML = `
      <div class="legend-title">${investorTitle}</div>
      <div class="legend-scale">
        <div class="legend-item"><div class="legend-color" style="background-color:#fae8ee"></div><div class="legend-label">Low</div></div>
        <div class="legend-item"><div class="legend-color" style="background-color:#f8d0db"></div><div class="legend-label"></div></div>
        <div class="legend-item"><div class="legend-color" style="background-color:#EEB0C2"></div><div class="legend-label"></div></div>
        <div class="legend-item"><div class="legend-color" style="background-color:#d4899e"></div><div class="legend-label"></div></div>
        <div class="legend-item"><div class="legend-color" style="background-color:#c06c84"></div><div class="legend-label">High</div></div>
      </div>
      <div class="legend-title">Eviction Rate (${year})</div>
      <div class="legend-circles">
        <div class="legend-circle-item"><div class="legend-circle" style="width:10px;height:10px;"></div><div class="legend-label">Low</div></div>
        <div class="legend-circle-item"><div class="legend-circle" style="width:20px;height:20px;"></div><div class="legend-label">High</div></div>
      </div>`;
  }

  function toggleLayer(layer) {
    visibleLayers.update((c) => ({ ...c, [layer]: !c[layer] }));
  }

  function selectOne(type) {
    visibleLayers.update((c) => ({
      institutional: false,
      large: false,
      medium: false,
      small: false,
      white: false,
      black: false,
      hispanic: false,
      asian: false,
      other: false,
      [type]: true,
    }));
  }
</script>

<section id="city-section" class="section">
  <div class="section-header">
    <h2>Boston City-Wide Analysis</h2>
    <p>
      Explore investor ownership and eviction patterns across the entire city of
      Boston.
    </p>
  </div>

  <div class="filter-controls">
    <!-- Investor Types group -->
    <div class="filter-group">
      <h3>Investor Types</h3>
      <div class="filter-buttons">
        <button
          class="investor-btn"
          class:active={$visibleLayers.institutional}
          on:click={() => selectOne("institutional")}
        >
          Institutional
        </button>
        <button
          class="investor-btn"
          class:active={$visibleLayers.large}
          on:click={() => selectOne("large")}
        >
          Large
        </button>
        <button
          class="investor-btn"
          class:active={$visibleLayers.medium}
          on:click={() => selectOne("medium")}
        >
          Medium
        </button>
        <button
          class="investor-btn"
          class:active={$visibleLayers.small}
          on:click={() => selectOne("small")}
        >
          Small
        </button>
      </div>
    </div>

    <!-- Demographics group -->
    <div class="filter-group">
      <h3>Demographics</h3>
      <div class="filter-buttons">
        <button
          class="demographic-btn"
          class:active={$visibleLayers.white}
          on:click={() => selectOne("white")}
        >
          White
        </button>
        <button
          class="demographic-btn"
          class:active={$visibleLayers.black}
          on:click={() => selectOne("black")}
        >
          Black
        </button>
        <button
          class="demographic-btn"
          class:active={$visibleLayers.hispanic}
          on:click={() => selectOne("hispanic")}
        >
          Hispanic
        </button>
        <button
          class="demographic-btn"
          class:active={$visibleLayers.asian}
          on:click={() => selectOne("asian")}
        >
          Asian
        </button>
        <button
          class="demographic-btn"
          class:active={$visibleLayers.other}
          on:click={() => selectOne("other")}
        >
          Other
        </button>
      </div>
    </div>

    <!-- Eviction Rate group -->
    <div class="filter-group">
      <h3>Eviction Rate</h3>
      <div class="filter-buttons">
        <button
          class="eviction-btn"
          class:active={$visibleLayers.evictions}
          on:click={() => toggleLayer("evictions")}
        >
          {#if $visibleLayers.evictions}
            Hide
          {:else}
            Show
          {/if}
        </button>
      </div>
    </div>

    <div class="visualization-container full-width">
      <div class="map-container" bind:this={mapContainer}></div>
    </div>

    <div class="section-footer">
      <p>
        This city-wide view reveals patterns of investor ownership and eviction
        rates across Boston neighborhoods.
      </p>
      <p>
        Toggle between different investor types to see how their presence
        correlates with eviction rates in different areas.
      </p>
    </div>
  </div>
</section>

<style>
  .map-container {
    width: 100%;
    height: 600px;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
  }

  .filter-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    margin-bottom: 1rem;
    justify-content: center;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .filter-group h3 {
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }

  .filter-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .section-footer {
    margin-top: 2rem;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
  }

  :global(.map-legend) {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: white;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    z-index: 1;
    font-size: 0.8rem;
    max-width: 200px;
  }

  :global(.legend-title) {
    font-weight: bold;
    margin-bottom: 5px;
    margin-top: 10px;
  }

  :global(.legend-scale) {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }

  :global(.legend-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-right: 5px;
  }

  :global(.legend-color) {
    width: 20px;
    height: 20px;
    margin-bottom: 2px;
  }

  :global(.legend-circles) {
    display: flex;
    align-items: flex-end;
    margin-bottom: 5px;
  }

  :global(.legend-circle-item) {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-right: 10px;
  }

  :global(.legend-circle) {
    border-radius: 50%;
    background-color: black;
    opacity: 0.6;
  }

  :global(.legend-label) {
    font-size: 0.7rem;
    text-align: center;
  }

  :global(.mapboxgl-popup) {
    max-width: 300px;
    font-family: "Roboto", sans-serif;
  }

  :global(.mapboxgl-popup-content) {
    padding: 15px;
    border-radius: 5px;
  }

  :global(.mapboxgl-popup-content h4) {
    margin: 0 0 10px;
    font-weight: 500;
    color: #000;
  }

  :global(.mapboxgl-popup-content p) {
    margin: 5px 0;
    color: #000;
  }

  @media (max-width: 768px) {
    .filter-controls {
      flex-direction: column;
      gap: 1rem;
    }

    .map-container {
      height: 400px;
    }
  }

  .visualization-container.full-width {
    width: 100%;
    /* Optionally ensure it lays out properly: */
    display: block;
  }

  /* button styling */
  .demographic-btn {
    background: white;
    color: black;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    transition:
      background 0.2s,
      color 0.2s;
  }

  /* Active state */
  .demographic-btn.active {
    background: #f3b187;
    color: white;
    border-color: #f3b187;
  }

  .investor-btn {
    background: white;
    color: #000;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s;
  }

  .investor-btn.active {
    background: #e4b2c1;
    color: white;
    border-color: #e4b2c1;
  }

  .eviction-btn {
    background: white;
    color: black;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s;
  }

  /* active state */
  .eviction-btn.active {
    background: #99e4cc;
    color: white;
    border-color: #99e4cc;
    padding: 0.6rem 1.2rem;
  }
</style>
