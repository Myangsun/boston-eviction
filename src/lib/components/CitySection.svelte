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
    selectedFlipindex,
    // Import dorchesterData but keep it independent from other components
    dorchesterData
  } from "$lib/stores.js";
  import { getMapboxToken } from "$lib/mapboxConfig.js";

  let mapContainer, map, legend;
  let Flipindex;
  // Initialize to empty string but don't modify the global store immediately
  // This prevents affecting other components that depend on this value
  let localFlipindex = "";

  // local reactive copies
  let layers = {};
  let year;
  let data = [];
  let fullDorchesterData = []; // Local data from dorchesterData store
  let boundaries = {};
  let scales = {};
  let census = [];

  // subscriptions
  const unsubLayers = visibleLayers.subscribe((v) => {
    layers = v;
    if (map) updateMapLayers();
  });
  
  const unsubYear = selectedYear.subscribe((v) => {
    year = v;
    if (map) updateMapLayers();
  });
  
  const unsubData = evictionData.subscribe((v) => {
    data = v;
    if (map) updateMapLayers();
  });
  
  // Add subscription to dorchesterData
  const unsubDorchesterData = dorchesterData.subscribe((v) => {
    fullDorchesterData = v;
    if (map) updateMapLayers();
  });
  
  const unsubBounds = boundaryData.subscribe((v) => {
    boundaries = v;
    if (map) updateMapLayers();
  });
  
  const unsubScales = dataScales.subscribe((v) => {
    scales = v;
    if (map) updateMapLayers();
  });
  
  const unsubCensus = censusData.subscribe((v) => {
    census = v;
    if (map) updateMapLayers();
  });
  
  // Use local variable first, then update store when needed
  const unsubFlip = selectedFlipindex.subscribe((v) => {
    Flipindex = v;
    if (map) updateMapLayers();
  });

  /**
   * Only one of { investor, demographic, indicator } can be active at a time.
   * category: "investor" | "demographic" | "indicator"
   * type: e.g. "large", "black", "median_rent", etc.
   */
  function selectFilter(category, type) {
    if (category === "investor") {
      visibleLayers.set({
        institutional: type === "institutional",
        large: type === "large",
        medium: type === "medium",
        small: type === "small",
        evictions: layers.evictions,
        white: false,
        black: false,
        hispanic: false,
        asian: false,
        other: false,
      });
      // Use local variable first to avoid impacting other components
      localFlipindex = "";
      // Then update the global store
      selectedFlipindex.set(localFlipindex);
    } else if (category === "demographic") {
      visibleLayers.set({
        institutional: false,
        large: false,
        medium: false,
        small: false,
        evictions: layers.evictions,
        white: type === "white",
        black: type === "black",
        hispanic: type === "hispanic",
        asian: type === "asian",
        other: type === "other",
      });
      // Use local variable first to avoid impacting other components
      localFlipindex = "";
      // Then update the global store
      selectedFlipindex.set(localFlipindex);
    } else if (category === "indicator") {
      visibleLayers.set({
        institutional: false,
        large: false,
        medium: false,
        small: false,
        evictions: layers.evictions,
        white: false,
        black: false,
        hispanic: false,
        asian: false,
        other: false,
      });
      // Use local variable first to avoid impacting other components
      localFlipindex = type;
      // Then update the global store
      selectedFlipindex.set(localFlipindex);
    }
    updateMapLayers();
  }

  onMount(() => {
    // Use local Flipindex value rather than setting global store
    localFlipindex = "";
    
    mapboxgl.accessToken = getMapboxToken();
    const bostonBounds = [
      [-71.347969, 42.207069], //SW
      [-71.08619 * 2 + 71.347969, 42.312524 * 2 - 42.207069], //NE
    ];
    map = new mapboxgl.Map({
      container: mapContainer,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 0], // [-71.08619, 42.312524], // Boston center
      zoom: 10,
      minZoom: 10,
      maxZoom: 13,
      maxBounds: bostonBounds,
    });
    legend = document.createElement("div");
    legend.className = "map-legend";
    mapContainer.appendChild(legend);

    map.on("load", initializeMapLayers);
    map.on("error", (e) => console.error("Map error:", e));

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    map.on("load", () => {
      initializeMapLayers();

      // create one shared popup
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      // hover interaction
      map.on("mousemove", "boston-fill", (e) => {
        if (!e.features.length) return;

        const feat = e.features[0];
        const p = feat.properties;

        // pick label + value based on current mode
        let metricLabel, metricValue;
        if (Flipindex) {
          metricLabel = Flipindex === "median_rent" ? "Median Rent" : "Price Δ";
          
          // Add safety check for p.index_value
          let indexValue = p.index_value !== undefined ? p.index_value : 0;
          try {
            metricValue = `$${indexValue.toLocaleString() || 0}`;
          } catch (err) {
            metricValue = `$${indexValue || 0}`;
          }
        } else if (
          ["white", "black", "hispanic", "asian", "other"].find(
            (d) => layers[d]
          )
        ) {
          const demoType = ["white", "black", "hispanic", "asian", "other"].find((d) => layers[d]);
          metricLabel = `${demoType.charAt(0).toUpperCase() + demoType.slice(1)} %`;
          metricValue = `${(p.dem_pct * 100).toFixed(1)}%`;
        } else {
          const invType =
            ["institutional", "large", "medium", "small"].find(
              (k) => layers[k]
            ) || "institutional";
          metricLabel = `${invType[0].toUpperCase() + invType.slice(1)} Investors`;
          metricValue = `${p.investor_count || 0}`;
        }

        // always show eviction rate
        const evictionPct = (p.eviction_rate * 100).toFixed(1);

        // change cursor
        map.getCanvas().style.cursor = "pointer";

        // highlight just the hovered tract by adjusting outline color
        map.setPaintProperty("boston-fill", "fill-outline-color", [
          "case",
          ["==", ["get", "tract_id"], p.tract_id],
          "#000",
          "#ccc",
        ]);

        // show popup
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `
        <h4>Tract ${p.tract_id}</h4>
        <p><strong>${metricLabel}:</strong> ${metricValue}</p>
        <p><strong>Eviction Rate (${year}):</strong> ${evictionPct}%</p>
      `
          )
          .addTo(map);
      });

      // cleanup when mouse leaves
      map.on("mouseleave", "boston-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
        map.setPaintProperty("boston-fill", "fill-outline-color", "#ccc");
      });
    });

    return () => {
      map.remove();
      legend.remove();
      unsubLayers();
      unsubYear();
      unsubData();
      unsubDorchesterData(); 
      unsubBounds();
      unsubScales();
      unsubCensus();
      unsubFlip();
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
      });
      map.addLayer({
        id: "boston-evictions",
        type: "circle",
        source: "boston-data",
        filter: ["==", "$type", "Point"], // <-- only points
        paint: {
          "circle-color": "black",
          "circle-opacity": 0.6,
          "circle-radius": [
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
          ],
        },
      });
    }
    updateMapLayers();
  }

  function updateMapLayers() {
    if (!map || !data.length || !boundaries.features) return;

    // 1) demographics
    const demo = ["white", "black", "hispanic", "asian", "other"].find(
      (d) => layers[d]
    );
    if (demo) {
      const feats = boundaries.features.flatMap((bf) => {
        const id = bf.properties.geoid;
        const c = census.find((c) => c.GEOID === id);
        if (!c) return [];
        const pop = +c.pop || 0;
        let count =
          { white: +c.nhwhi, black: +c.nhaa, asian: +c.nhas, other: +c.nhoth }[
            demo
          ] || 0;
        if (demo === "hispanic")
          count =
            pop -
            [
              +c.nhwhi,
              +c.nhaa,
              +c.nhna,
              +c.nhas,
              +c.nhpi,
              +c.nhoth,
              +c.nhmlt,
            ].reduce((s, n) => s + n, 0);
        const pct = pop > 0 ? count / pop : 0;
        const rec = data.find((d) => d.GEOID === id);
        const ev = rec ? +rec[`eviction_rate_${year}`] : 0;
        return [
          {
            type: "Feature",
            geometry: bf.geometry,
            properties: { tract_id: id, dem_pct: pct, eviction_rate: ev },
          },
          ...(layers.evictions
            ? [
                {
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: centroid(bf.geometry),
                  },
                  properties: { tract_id: id, dem_pct: pct, eviction_rate: ev },
                },
              ]
            : []),
        ];
      });
      map
        .getSource("boston-data")
        .setData({ type: "FeatureCollection", features: feats });
      map.setPaintProperty("boston-fill", "fill-color", [
        "interpolate",
        ["linear"],
        ["get", "dem_pct"],
        0,
        "#fff5eb",
        0.25,
        "#ffd8b1",
        0.5,
        "#ffb97a",
        0.75,
        "#ff9a44",
        1,
        "#ff7b00",
      ]);
      map.setLayoutProperty(
        "boston-evictions",
        "visibility",
        layers.evictions ? "visible" : "none"
      );
      updateLegend(demo);
      return;
    }

    // 2) indicator (rent/price)
    if (Flipindex === "median_rent" || Flipindex === "median_price_diff") {
      // Use dorchesterData store as the source for median_rent and median_price_diff values
      if (!fullDorchesterData || fullDorchesterData.length === 0) {
        console.log("Waiting for fullDorchesterData to load");
        return;
      }

      // 1) build both fill + circle Features
      const feats = boundaries.features.flatMap((bf) => {
        const id = bf.properties.geoid;
        
        // Find data from dorchesterData store instead
        const dorchesterRec = fullDorchesterData.find(d => d.GEOID === id || d.tract_id === id);
        if (!dorchesterRec) return [];
        
        const rec = data.find(d => d.GEOID === id); // Still need for eviction rate
        if (!rec) return [];
        
        // Get value from dorchesterData which has the same structure
        const val = Flipindex === "median_rent" 
          ? +dorchesterRec.median_rent || 0 
          : +dorchesterRec.median_price_diff || 0;
          
        const ev = +rec[`eviction_rate_${year}`] || 0;

        // always push the polygon
        const out = [
          {
            type: "Feature",
            geometry: bf.geometry,
            properties: {
              tract_id: id,
              index_value: val,
              eviction_rate: ev,
            },
          },
        ];

        // if eviction‐circles are turned on, push a Point
        if (layers.evictions) {
          out.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: centroid(bf.geometry),
            },
            properties: {
              tract_id: id,
              index_value: val,
              eviction_rate: ev,
            },
          });
        }

        return out;
      });

      // 2) feed it to the source
      map.getSource("boston-data").setData({
        type: "FeatureCollection",
        features: feats,
      });

      // 3) paint the fill using your green ramp
      const {
        minMedianRent,
        maxMedianRent,
        minMedianPriceDiff,
        maxMedianPriceDiff,
      } = scales;

      if (Flipindex === "median_rent") {
        map.setPaintProperty("boston-fill", "fill-color", [
          "interpolate",
          ["linear"],
          ["get", "index_value"],
          minMedianRent,
          "#e6f7f3",
          maxMedianRent * 0.25,
          "#c4eee1",
          maxMedianRent * 0.5,
          "#99e4cc",
          maxMedianRent * 0.75,
          "#66b89f",
          maxMedianRent,
          "#338b73",
        ]);
      } else {
        map.setPaintProperty("boston-fill", "fill-color", [
          "interpolate",
          ["linear"],
          ["get", "index_value"],
          minMedianPriceDiff,
          "#e6f7f3",
          maxMedianPriceDiff * 0.25,
          "#c4eee1",
          maxMedianPriceDiff * 0.5,
          "#99e4cc",
          maxMedianPriceDiff * 0.75,
          "#66b89f",
          maxMedianPriceDiff,
          "#338b73",
        ]);
      }

      // 4) toggle your eviction circles exactly like in the other branches
      map.setLayoutProperty(
        "boston-evictions",
        "visibility",
        layers.evictions ? "visible" : "none"
      );

      updateLegend(Flipindex);
      return;
    }

    // 3) investor counts
    const inv =
      ["institutional", "large", "medium", "small"].find((k) => layers[k]) ||
      "institutional";
    const feats = [];
    data.forEach((d) => {
      const cnt = +d[`sum_${inv}_investor`] || 0;
      if (!cnt) return;
      const bf = boundaries.features.find(
        (f) => f.properties.geoid === d.GEOID
      );
      if (!bf) return;
      const ev = +d[`eviction_rate_${year}`] || 0;
      feats.push({
        type: "Feature",
        geometry: bf.geometry,
        properties: {
          tract_id: d.GEOID,
          investor_count: cnt,
          eviction_rate: ev,
        },
      });
      if (layers.evictions)
        feats.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: centroid(bf.geometry) },
          properties: {
            tract_id: d.GEOID,
            investor_count: cnt,
            eviction_rate: ev,
          },
        });
    });
    map
      .getSource("boston-data")
      .setData({ type: "FeatureCollection", features: feats });
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
    map.setLayoutProperty(
      "boston-evictions",
      "visibility",
      layers.evictions ? "visible" : "none"
    );
    updateLegend(inv);
  }

  function centroid(geom) {
    const coords =
      geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
    const s = coords.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
    return [s[0] / coords.length, s[1] / coords.length];
  }

  function updateLegend(mode) {
    const yTitle = `<div class="legend-title">Eviction Rate (${year})</div>`;
    const yCircles = `
      <div class="legend-circles">
        <div class="legend-circle-item">
          <div class="legend-circle" style="width:10px;height:10px"></div>
          <div class="legend-label">Low</div>
        </div>
        <div class="legend-circle-item">
          <div class="legend-circle" style="width:25px;height:25px"></div>
          <div class="legend-label">High</div>
        </div>
      </div>`;
    let html = "";

    if (["white", "black", "hispanic", "asian", "other"].includes(mode)) {
      const title = mode[0].toUpperCase() + mode.slice(1) + " Population %";
      html = `
        <div class="legend-title">${title}</div>
        <div class="legend-scale">
          <div class="legend-item"><div class="legend-color" style="background:#fff5eb"></div><div class="legend-label">0%</div></div>
          <div class="legend-item"><div class="legend-color" style="background:#ffb97a"></div><div class="legend-label">50%</div></div>
          <div class="legend-item"><div class="legend-color" style="background:#ff7b00"></div><div class="legend-label">100%</div></div>
        </div>`;
    } else if (mode === "median_rent" || mode === "median_price_diff") {
      const rent = mode === "median_rent";
      const title = rent ? "Median Monthly Rent" : "Median Price Difference";
      const colors = rent
        ? ["#e6f7f3", "#c4eee1", "#99e4cc", "#66b89f", "#338b73"]
        : ["#e6f7f3", "#c4eee1", "#99e4cc", "#66b89f", "#338b73"];
      const labels = rent
        ? ["$400", "$1k", "$2k", "$3k", "$3.5k+"]
        : ["-50k", "0", "+50k", "+100k", "+135k"];
      html = `
        <div class="legend-title">${title}</div>
        <div class="legend-scale">
          ${colors
            .map(
              (c, i) => `
            <div class="legend-item">
              <div class="legend-color" style="background:${c}"></div>
              <div class="legend-label">${labels[i]}</div>
            </div>
          `
            )
            .join("")}
        </div>`;
    } else {
      const title = mode[0].toUpperCase() + mode.slice(1) + " Investors";
      html = `
        <div class="legend-title">${title}</div>
        <div class="legend-scale">
          <div class="legend-item"><div class="legend-color" style="background:#fae8ee"></div><div class="legend-label">Low</div></div>
          <div class="legend-item"><div class="legend-color" style="background:#c06c84"></div><div class="legend-label">High</div></div>
        </div>`;
    }

    legend.innerHTML = html + yTitle + yCircles;
  }
</script>

<section id="city-section" class="section">
  <div class="section-header">
    <h2>Boston City-Wide Analysis</h2>
    <p>Explore investor, demographic, rent/price & eviction patterns.</p>
  </div>

  <div class="filter-controls">
    <!-- Investors -->
    <div class="filter-group">
      <h3>Investor Types</h3>
      <div class="filter-buttons">
        <button
          class="investor-btn"
          class:active={$visibleLayers.institutional}
          on:click={() => selectFilter("investor", "institutional")}
          >Institutional</button
        >
        <button
          class="investor-btn"
          class:active={$visibleLayers.large}
          on:click={() => selectFilter("investor", "large")}>Large</button
        >
        <button
          class="investor-btn"
          class:active={$visibleLayers.medium}
          on:click={() => selectFilter("investor", "medium")}>Medium</button
        >
        <button
          class="investor-btn"
          class:active={$visibleLayers.small}
          on:click={() => selectFilter("investor", "small")}>Small</button
        >
      </div>
    </div>

    <!-- Demographics -->
    <div class="filter-group">
      <h3>Demographics</h3>
      <div class="filter-buttons">
        <button
          class="demographic-btn"
          class:active={$visibleLayers.white}
          on:click={() => selectFilter("demographic", "white")}>White</button
        >
        <button
          class="demographic-btn"
          class:active={$visibleLayers.black}
          on:click={() => selectFilter("demographic", "black")}>Black</button
        >
        <button
          class="demographic-btn"
          class:active={$visibleLayers.hispanic}
          on:click={() => selectFilter("demographic", "hispanic")}
          >Hispanic</button
        >
        <button
          class="demographic-btn"
          class:active={$visibleLayers.asian}
          on:click={() => selectFilter("demographic", "asian")}>Asian</button
        >
        <button
          class="demographic-btn"
          class:active={$visibleLayers.other}
          on:click={() => selectFilter("demographic", "other")}>Other</button
        >
      </div>
    </div>

    <!-- Indicator -->
    <div class="filter-group">
      <h3>Indicator</h3>
      <div class="filter-buttons">
        <button
          class="rent-btn"
          class:active={Flipindex === "median_rent"}
          on:click={() => selectFilter("indicator", "median_rent")}
          >Median Rent</button
        >
        <button
          class="rent-btn"
          class:active={Flipindex === "median_price_diff"}
          on:click={() => selectFilter("indicator", "median_price_diff")}
          >Price Difference</button
        >
      </div>
    </div>

    <!-- Eviction Rate toggle -->
    <div class="filter-group">
      <h3>Eviction Rate</h3>
      <div class="filter-buttons">
        <button
          class="eviction-btn"
          class:active={$visibleLayers.evictions}
          on:click={() =>
            visibleLayers.update((c) => ({ ...c, evictions: !c.evictions }))}
        >
          {#if $visibleLayers.evictions}Hide{:else}Show{/if}
        </button>
      </div>
    </div>
  </div>

  <div class="visualization-container full-width">
    <div class="map-container" bind:this={mapContainer}></div>
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

  .rent-btn {
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

  .rent-btn.active {
    background: #99e4cc;
    color: white;
    border-color: #99e4cc;
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
    background: #a899e4;
    color: white;
    border-color: #a899e4;
  }
</style>
