/**
 * sources.js — the standalone "Where to Get" page.
 * Keeps sources.html independent from the care form logic in script.js.
 */
(function () {
  'use strict';

  var breedNameEl = document.getElementById('breed-name');
  if (!breedNameEl) return;

  var petTypeNameEl = document.getElementById('pet-type-name');
  var locationDisplay = document.getElementById('location-display');
  var typeFilter = document.getElementById('type-filter');
  var sortFilter = document.getElementById('sort-filter');
  var loading = document.getElementById('sources-loading');
  var errorEl = document.getElementById('sources-error');
  var grid = document.getElementById('sources-grid');
  var noResults = document.getElementById('no-results');
  var pagination = document.getElementById('pagination');
  var pageInfo = document.getElementById('page-info');
  var prevBtn = document.getElementById('prev-page');
  var nextBtn = document.getElementById('next-page');
  var heading = document.getElementById('sources-title');

  var PER_PAGE = 8;
  var allShops = [];
  var page = 0;

  var params = new URLSearchParams(window.location.search);
  var petType = params.get('type') || params.get('petType') || '';
  var breed = params.get('breed') || '';
  var location = params.get('location') || '';

  // Escaping and map links live in utils.js so both pages handle API strings
  // identically.
  function escapeHtml(value) {
    return window.PetGuide.escapeHtml(value);
  }

  function mapsHref(shop) {
    return window.PetGuide.mapsHref(shop);
  }

  breedNameEl.textContent = breed || 'your pet';
  petTypeNameEl.textContent = petType || 'any type';
  locationDisplay.textContent = location
    ? 'Showing results near ' + location
    : 'No location yet — add one to see shelters and rescues nearby';

  function badge(shop) {
    if (shop.type === 'shelter') return { text: 'Shelter or rescue', cls: 'badge-shelter' };
    if (shop.place_id) return { text: 'Local seller', cls: 'badge-seller' };
    return { text: 'Online listing', cls: 'badge-online' };
  }

  

  function cardHtml(shop) {
    var tag = badge(shop);
    var stars = shop.rating
      ? '<p class="source-rating" aria-label="Rated ' + shop.rating + ' out of 5">★ ' + shop.rating +
        (shop.reviews ? ' <span class="source-reviews">(' + shop.reviews + ')</span>' : '') + '</p>'
      : '';
    var address = shop.address ? '<p class="source-address">' + escapeHtml(shop.address) + '</p>' : '';
    var phone = shop.phone
      ? '<a class="source-phone" href="tel:' + escapeHtml(shop.phone.replace(/\s/g, '')) + '">' +
        escapeHtml(shop.phone) + '</a>'
      : '';
    var maps = mapsHref(shop);
    var link = shop.url
      ? '<a class="source-link" href="' + escapeHtml(shop.url) + '" target="_blank" rel="noopener noreferrer">Visit site</a>'
      : (maps ? '<a class="source-link" href="' + escapeHtml(maps) + '" target="_blank" rel="noopener noreferrer">View map</a>' : '');
    var caution = tag.cls === 'badge-shelter'
      ? ''
      : '<p class="source-caution">Verify health records and visit before paying.</p>';

    return '<article class="source-card">' +
      '<div class="source-card-head">' +
        '<h3 class="source-name">' + escapeHtml(shop.name || 'Unnamed') + '</h3>' +
        '<span class="source-badge ' + tag.cls + '">' + tag.text + '</span>' +
      '</div>' + stars + address + phone +
      (shop.snippet ? '<p class="source-snippet">' + escapeHtml(shop.snippet) + '</p>' : '') +
      caution + link + '</article>';
  }

  function filtered() {
    var filter = typeFilter ? typeFilter.value : 'all';
    var list = allShops.filter(function (shop) {
      if (filter === 'all') return true;
      if (filter === 'shelter') return shop.type === 'shelter';
      if (filter === 'local') return shop.type !== 'shelter' && !!shop.place_id;
      return shop.type !== 'shelter' && !shop.place_id;
    });

    var sort = sortFilter ? sortFilter.value : 'recommended';
    return list.slice().sort(function (a, b) {
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
      var shelterA = a.type === 'shelter' ? 0 : 1;
      var shelterB = b.type === 'shelter' ? 0 : 1;
      if (shelterA !== shelterB) return shelterA - shelterB;
      var ratingA = a.rating || 0;
      var ratingB = b.rating || 0;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  function render() {
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (page >= pages) page = pages - 1;

    grid.innerHTML = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(cardHtml).join('');

    noResults.classList.toggle('hidden', list.length > 0);
    if (!list.length) {
      noResults.querySelector('p').textContent = location
        ? 'No sources found near ' + location + '. Try a nearby city or region.'
        : 'Add a location to see shelters, rescues and sellers near you.';
    }

    pagination.classList.toggle('hidden', pages <= 1);
    pageInfo.textContent = 'Page ' + (page + 1) + ' of ' + pages;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
  }

  function showError(message) {
    grid.innerHTML = '';
    noResults.classList.add('hidden');
    pagination.classList.add('hidden');
    errorEl.innerHTML = '<span>' + escapeHtml(message) + '</span> ' +
      '<button type="button" class="btn btn-small" id="sources-retry">Try again</button>';
    errorEl.classList.remove('hidden');
    var retry = document.getElementById('sources-retry');
    if (retry) retry.addEventListener('click', load);
  }

  function load() {
    if (!breed || !petType) {
      showError('Start from the care form so we know which pet to look for.');
      return;
    }
    if (!location) {
      loading.classList.add('hidden');
      errorEl.classList.add('hidden');
      noResults.querySelector('p').textContent =
        'Add a location to see shelters, rescues and sellers near you.';
      noResults.classList.remove('hidden');
      return;
    }

    loading.classList.remove('hidden');
    errorEl.classList.add('hidden');

    fetch('/api/pet-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petType: petType, breed: breed, location: location })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
      })
      .then(function (result) {
        loading.classList.add('hidden');
        if (!result.ok) {
          showError(result.status === 429
            ? 'Source search hit a rate limit. Try again in a minute.'
            : 'Could not load nearby sources right now.');
          return;
        }
        allShops = result.body.shops || [];
        page = 0;
        render();
      })
      .catch(function () {
        loading.classList.add('hidden');
        showError('Could not reach the server. Check your connection and try again.');
      });
  }

  if (typeFilter) typeFilter.addEventListener('change', function () { page = 0; render(); });
  if (sortFilter) sortFilter.addEventListener('change', function () { page = 0; render(); });
  if (prevBtn) prevBtn.addEventListener('click', function () { page -= 1; render(); });
  if (nextBtn) nextBtn.addEventListener('click', function () { page += 1; render(); });

  load();
})();