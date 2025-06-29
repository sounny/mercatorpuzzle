// Puzzle game using Leaflet

/**
 * Return array with X unique random numbers between 0 and max-1
 * @param {number} count
 * @param {number} max
 * @returns {number[]}
 */
function getRandomIndexes(count, max) {
  const result = [];
  while (result.length < count) {
    const n = Math.floor(Math.random() * max);
    if (!result.includes(n)) result.push(n);
  }
  return result;
}

/**
 * Convert GeoJSON coordinates to Leaflet coordinates
 * @param {string} type GeoJSON geometry type
 * @param {Array} coords Coordinates array
 * @returns {Array}
 */
function geoJSONToLeaflet(type, coords) {
  const paths = [];
  coords.forEach((c) => {
    const ring = [];
    const arr = type === 'Polygon' ? c : c[0];
    arr.forEach((pt) => {
      if (!isNaN(pt[0]) && !isNaN(pt[1])) ring.push([pt[1], pt[0]]);
    });
    paths.push(ring);
  });
  return paths;
}

/**
 * Expand bounds by percentage
 * @param {L.LatLngBounds} bounds
 * @param {number} percentage
 * @returns {L.LatLngBounds}
 */
function expandBounds(bounds, percentage) {
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const west = bounds.getWest();
  const dLat = (north - south) * (percentage / 100);
  const dLng = (east - west) * (percentage / 100);
  return L.latLngBounds([
    south - dLat,
    west - dLng,
  ], [
    north + dLat,
    east + dLng,
  ]);
}

/**
 * Move polygon so its center matches target
 * @param {L.Polygon} poly
 * @param {L.LatLng} center
 */
function movePolygon(poly, center) {
  const current = poly.getBounds().getCenter();
  const dLat = center.lat - current.lat;
  const dLng = center.lng - current.lng;
  const newLatLngs = poly.getLatLngs().map((ring) => ring.map((pt) => [pt.lat + dLat, pt.lng + dLng]));
  poly.setLatLngs(newLatLngs);
  poly.redraw();
}

/**
 * Make polygon draggable using mouse events
 * @param {L.Polygon} poly
 * @param {L.Map} map
 */
function enableDrag(poly, map) {
  let start = null;
  let initial = null;
  function onMove(e) {
    if (!start) return;
    const dLat = e.latlng.lat - start.lat;
    const dLng = e.latlng.lng - start.lng;
    const latlngs = initial.map((r) => r.map((p) => [p.lat + dLat, p.lng + dLng]));
    poly.setLatLngs(latlngs);
    poly.redraw();
  }
  function onUp() {
    if (!start) return;
    map.off('mousemove', onMove);
    map.off('mouseup', onUp);
    start = null;
    poly.fire('dragend');
  }
  poly.on('mousedown', (e) => {
    start = e.latlng;
    initial = poly.getLatLngs().map((r) => r.map((p) => ({ lat: p.lat, lng: p.lng })));
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
  });
}

/**
 * Check if bounds fully contain given rings
 * @param {L.LatLngBounds} bounds
 * @param {Array} rings
 * @returns {boolean}
 */
function boundsContainRings(bounds, rings) {
  return rings.every((ring) => ring.every((pt) => bounds.contains(pt)));
}

document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map_canvas', {
    center: [35, -20],
    zoom: 2,
    minZoom: 1,
    maxZoom: 6,
    doubleClickZoom: false,
    scrollWheelZoom: true,
    worldCopyJump: true,
  });

  const Esri_WorldShadedRelief = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}',
    {
      variant: 'World_Shaded_Relief',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
      maxZoom: 13,
      subdomains: ['a', 'b', 'c'],
      minZoom: 0,
    },
  );
  Esri_WorldShadedRelief.addTo(map);

  fetch('data/countries.geo.json')
    .then((r) => r.json())
    .then((data) => {
      L.geoJSON(data, {
        style: {
          color: '#ffffff',
          weight: 1,
          opacity: 0.5,
          fillOpacity: 0,
        },
        interactive: false,
      }).addTo(map);

      const countriesToShow = getRandomIndexes(15, data.features.length);
      let totalScore = 0;

      data.features.forEach((item, i) => {
        if (!countriesToShow.includes(i)) return;

        const coords = geoJSONToLeaflet(item.geometry.type, item.geometry.coordinates);
        const poly = L.polygon(coords, {
          color: '#FF0000',
          weight: 1,
          opacity: 1,
          fillColor: '#FF0000',
          fillOpacity: 0.4,
        });

        poly.countryNum = i;
        poly.countryName = item.properties.name;
        poly.countryCoords = coords.map((r) => r.map((p) => [p[0], p[1]]));

        const b = poly.getBounds();
        const areaIndicator = Math.abs(b.getNorth() - b.getSouth()) * Math.abs(b.getEast() - b.getWest());
        const targetBounds = expandBounds(b, areaIndicator < 20 ? 10 : 5);

        movePolygon(poly, L.latLng(Math.random() * 100 - 50, Math.random() * 300 - 150));
        poly.addTo(map);
        enableDrag(poly, map);

        poly.on('dblclick', () => placeCountry(poly, false));
        poly.on('dragend', () => {
          if (boundsContainRings(targetBounds, poly.getLatLngs())) {
            placeCountry(poly, true);
          }
        });
      });

      function placeCountry(poly, increment) {
        const color = increment ? '#00FF00' : '#0000FF';
        poly.setLatLngs(poly.countryCoords);
        poly.setStyle({ color, fillColor: color });
        poly.off('mousedown');
        const idx = countriesToShow.indexOf(poly.countryNum);
        if (idx !== -1) countriesToShow.splice(idx, 1);
        if (increment) totalScore++;
        let msg = increment ?
          `Nice! That is ${poly.countryName} indeed.` :
          `Alas, that was ${poly.countryName}`;
        if (countriesToShow.length === 0) {
          msg += ' // Game Finished! Hit refresh to start a new game!';
        }
        document.getElementById('message').textContent = msg;
        document.getElementById('score').textContent = `${totalScore}/15`;
      }
    });
});

