function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

function initContactMap() {
  const container = document.getElementById("contact-map");
  if (!container) return;
  if (typeof L === "undefined") {
    console.warn("Leaflet is not available, skipping contact map.");
    return;
  }

  const lat = parseFloat(container.dataset.lat) || 0;
  const lng = parseFloat(container.dataset.lng) || 0;
  const zoom = parseInt(container.dataset.zoom, 10) || 13;
  const label = container.dataset.label || "Location";

  const map = L.map(container, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true,
  }).setView([lat, lng], zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const marker = L.marker([lat, lng]).addTo(map);
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
  marker.bindPopup(
    `<strong>${label}</strong><br><a href="${osmLink}" target="_blank" rel="noopener">Open in OpenStreetMap</a>`
  );

  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    map.dragging.disable();
    map.tap?.disable();
  }
}

onReady(initContactMap);
