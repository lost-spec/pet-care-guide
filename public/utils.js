/* Shared helpers for the pages that render SerpAPI results.
   Both the care form and the standalone sources page display shop names,
   addresses and snippets from the API, so escaping and map-link building
   live here once instead of in two files that can drift apart. */
window.PetGuide = window.PetGuide || {};

window.PetGuide.escapeHtml = function (value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.PetGuide.mapsHref = function (shop) {
  if (!shop) return '';
  if (shop.gps_coordinates) {
    return 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(shop.gps_coordinates.lat + ',' + shop.gps_coordinates.lng);
  }
  var q = [shop.name, shop.address].filter(Boolean).join(' ');
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
};