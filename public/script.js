/**
 * script.js — form state, validation, API calls and rendering.
 * Reads pet-data.js (PetData) for per-species options.
 */
(function () {
  'use strict';

  var form = document.getElementById('pet-form');

  // This file only drives the care form. The sources page has its own module.
  if (!form) return;

  var petTypeSelect = document.getElementById('pet-type');
  var breedInput = document.getElementById('breed');
  var breedList = document.getElementById('breed-list');
  var breedLabel = document.getElementById('breed-label');
  var ageSelect = document.getElementById('age-stage');
  var weightInput = document.getElementById('weight');
  var weightUnitSelect = document.getElementById('weight-unit');
  var locationInput = document.getElementById('location');
  var submitBtn = document.getElementById('submit-btn');
  var submitText = submitBtn.querySelector('.btn-text');
  var spinner = submitBtn.querySelector('.spinner');
  var formError = document.getElementById('form-error');

  var results = document.getElementById('results');
  var resultsHeading = document.getElementById('results-heading');
  var resultsLoading = document.getElementById('results-loading');
  var resultsBody = document.getElementById('results-body');
  var warnings = document.getElementById('warnings');
  var hazardsBlock = document.getElementById('hazards-block');
  var hazards = document.getElementById('hazards');
  var warningsBlock = document.getElementById('warnings-block');
  var warningsList = document.getElementById('warnings-list');
  var summaryEl = document.getElementById('summary');

  var sourcesSection = document.getElementById('sources-section');
  var sourcesLoading = document.getElementById('sources-loading');
  var sourcesError = document.getElementById('sources-error');
  var sourcesEmpty = document.getElementById('sources-empty');
  var sourcesGrid = document.getElementById('sources-grid');
  var sourcesLocationPrompt = document.getElementById('sources-location-prompt');
  var sourcesLocationInput = document.getElementById('sources-location');
  var sourcesLocationBtn = document.getElementById('sources-location-btn');

  var errorState = document.getElementById('error-state');
  var errorMessage = document.getElementById('error-message');
  var retryBtn = document.getElementById('retry-btn');

  var sourcesLocation = '';
  var lastRequest = null;

  /* ---------------------------------------------------------------- utils */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  /* ------------------------------------------------------- pet-data wiring */

  function populateStages(petType, keep) {
    var options = window.PetData ? PetData.stages(petType) : [];
    ageSelect.innerHTML = '<option value="">Select…</option>';
    options.forEach(function (stage) {
      var option = document.createElement('option');
      option.value = stage;
      option.textContent = stage;
      ageSelect.appendChild(option);
    });
    if (keep && options.indexOf(keep) > -1) ageSelect.value = keep;
    // Let ui.js re-evaluate the floating label for the rebuilt option list.
    ageSelect.dispatchEvent(new Event('change'));
  }

  function populateBreeds(petType) {
    var options = window.PetData ? PetData.breeds(petType) : [];
    breedList.innerHTML = '';
    options.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      breedList.appendChild(option);
    });
  }

  function applyNoun(petType) {
    var noun = window.PetData ? PetData.noun(petType) : 'Breed';
    breedLabel.textContent = noun;
    breedInput.placeholder = window.PetData && petType ? PetData.placeholder(petType) : ' ';
    breedInput.setAttribute('aria-label', noun);
    form.setAttribute('data-breed-noun', noun);
  }

  function onPetTypeChange() {
    var petType = petTypeSelect.value;
    applyNoun(petType);
    populateBreeds(petType);
    populateStages(petType, ageSelect.value);
    clearFieldError(breedInput, 'breed-error');
    if (!results.classList.contains('hidden')) {
      // Options changed under an existing result set — start clean.
      hideResults();
    }
  }

  /* ---------------------------------------------------------- validation */

function looksLikeGibberish(value) {
    // 4-character runs from QWERTY rows, forwards and backwards. Real breed
    // names never contain these; keyboard mashing always does.
    var keyboardRuns = ('qwer wert erty rtyu tyui yuiop asdf sdfg dfgh fghj ghjk ' +
      'zxcv xcvb cvbn vbnm poiu oiuy iuyt uytr lkjh kjhg jhgf hgfd gfed ' +
      'nmbv mbvc bvcx vcxz 1234 2345 3456 4567 5678 6789 9876 8765 7654 6543 ' +
      'qaz wsx edc rfv tgb yhn ujm azq xsw cde vfr bgt hny mju').split(' ');

    var s = value.toLowerCase();
    var letters = s.replace(/[^a-z]/g, '');
    if (letters.length < 2) return true;
    if (/([a-z])\1{3,}/.test(letters)) return true;           // "aaaaaa"
    if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(letters)) return true; // "kjhsdf"
    if (/[aeiou]{4,}/.test(letters)) return true;                // "aeiouae"
    for (var i = 0; i < keyboardRuns.length; i++) {
      if (s.indexOf(keyboardRuns[i]) > -1) return true;         // "qwerty"
    }
    return false;
  }

  function setFieldError(input, errorId, message) {
    var error = document.getElementById(errorId);
    if (message) {
      error.textContent = message;
      error.classList.remove('hidden');
      input.setAttribute('aria-invalid', 'true');
    } else {
      error.textContent = '';
      error.classList.add('hidden');
      input.setAttribute('aria-invalid', 'false');
    }
  }

  function clearFieldError(input, errorId) {
    setFieldError(input, errorId, '');
  }

  function validateBreed() {
    var raw = breedInput.value || '';
    var value = raw.trim();
    breedInput.value = value;

    if (!value) {
      setFieldError(breedInput, 'breed-error', 'Enter a breed or species, or choose “Mixed / Not sure”.');
      return null;
    }
    if (value.length > 60) {
      setFieldError(breedInput, 'breed-error', 'Keep this under 60 characters.');
      return null;
    }
    if (!/[a-z]/i.test(value)) {
      setFieldError(breedInput, 'breed-error', 'Use letters, for example “Labrador Retriever”.');
      return null;
    }
    if (looksLikeGibberish(value)) {
      setFieldError(breedInput, 'breed-error', 'That does not look like a breed name. Check the spelling, or choose “Mixed / Not sure”.');
      return null;
    }
    clearFieldError(breedInput, 'breed-error');
    return value;
  }

  function validateWeight() {
    var raw = (weightInput.value || '').trim();
    if (!raw) {
      clearFieldError(weightInput, 'weight-error');
      return { weight: '', weightUnit: weightUnitSelect.value };
    }
    var num = Number(raw);
    if (!/^\d*\.?\d{1,2}$/.test(raw) || !isFinite(num) || num <= 0 || num > 2000) {
      setFieldError(weightInput, 'weight-error', 'Enter a number between 0 and 2000.');
      return null;
    }
    clearFieldError(weightInput, 'weight-error');
    return { weight: raw, weightUnit: weightUnitSelect.value };
  }

  /* --------------------------------------------------------- URL  state  */

  function getUrlParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      petType: params.get('type') || params.get('petType') || '',
      breed: params.get('breed') || '',
      ageStage: params.get('age') || params.get('ageStage') || '',
      weight: params.get('wt') || params.get('weight') || '',
      weightUnit: params.get('unit') || params.get('weightUnit') || 'kg',
      location: params.get('location') || ''
    };
  }

  function updateUrl(state) {
    var params = new URLSearchParams();
    if (state.petType) params.set('type', state.petType);
    if (state.breed) params.set('breed', state.breed);
    if (state.ageStage) params.set('age', state.ageStage);
    if (state.weight) {
      params.set('wt', state.weight);
      params.set('unit', state.weightUnit);
    }
    if (state.location) params.set('location', state.location);
    var query = params.toString();
    window.history.replaceState(null, '', query ? '?' + query : window.location.pathname);
  }

  /* ------------------------------------------------------- state changes */

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    submitText.textContent = isLoading ? 'Fetching care info…' : 'Get Care Info';
    spinner.classList.toggle('hidden', !isLoading);
    if (isLoading) {
      hideError();
      results.classList.remove('hidden');
      resultsLoading.classList.remove('hidden');
      resultsBody.classList.add('hidden');
    } else {
      resultsLoading.classList.add('hidden');
      resultsBody.classList.remove('hidden');
    }
  }

  function hideResults() {
    results.classList.add('hidden');
    resultsBody.classList.add('hidden');
    resultsLoading.classList.add('hidden');
    warnings.classList.add('hidden');
    sourcesSection.classList.add('hidden');
  }

  function hideError() {
    errorState.classList.add('hidden');
  }

  function showError(message) {
    results.classList.add('hidden');
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
    errorState.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  var ERROR_COPY = {
    network: 'Could not reach the server. Check your connection and try again.',
    invalidBreed: 'We could not match that breed. Try a common breed name, or choose “Mixed / Not sure”.',
    rateLimit: 'Too many requests just now. Wait about a minute, then try again.',
    noResults: 'No guidance came back for that pet. Try a different breed name.',
    server: 'The server ran into a problem generating guidance. Please try again.'
  };

  function describeError(status, body) {
    var message = body && body.error ? String(body.error) : '';
    if (status === 404 || /unknown breed/i.test(message)) return ERROR_COPY.invalidBreed;
    if (status === 429) return ERROR_COPY.rateLimit;
    if (status === 503) return ERROR_COPY.network;
    return ERROR_COPY.server;
  }

  /* ------------------------------------------------------------ rendering */

  function renderKeypoints(container, points) {
    container.innerHTML = '';
    (points || []).forEach(function (point) {
      var item = document.createElement('div');
      item.className = 'keypoint-card';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        '<div class="keypoint-label">' + escapeHtml(point.label) + '</div>' +
        '<div class="keypoint-value">' + escapeHtml(point.value) + '</div>';
      container.appendChild(item);
    });
  }

  function renderDetails(id, text) {
    var target = document.getElementById(id);
    if (!target) return;
    target.innerHTML = (text || '')
      .split(/\n{2,}|\n/)
      .filter(Boolean)
      .map(function (para) { return '<p>' + escapeHtml(para) + '</p>'; })
      .join('');
  }

  function renderHazards(data) {
    var petType = petTypeSelect.value;
    var seen = {};
    var merged = [];

    (window.PetData ? PetData.hazards(petType) : []).forEach(function (item) {
      seen[item.label.toLowerCase()] = true;
      merged.push(item);
    });

    (data.hazards || []).forEach(function (item) {
      if (!item || !item.label) return;
      var key = String(item.label).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      merged.push({ label: item.label, value: item.value });
    });

    if (!merged.length) {
      hazardsBlock.classList.add('hidden');
    } else {
      hazardsBlock.classList.remove('hidden');
      renderKeypoints(hazards, merged.slice(0, 6));
    }

    var notes = (data.warnings || []).filter(Boolean);
    if (notes.length) {
      warningsBlock.classList.remove('hidden');
      warningsList.innerHTML = notes
        .map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; })
        .join('');
    } else {
      warningsBlock.classList.add('hidden');
      warningsList.innerHTML = '';
    }

    warnings.classList.remove('hidden');
  }

  function render(data) {
    summaryEl.textContent = data.summary || '';
    renderKeypoints(document.getElementById('feeding-keypoints'), data.feeding && data.feeding.keyPoints);
    renderDetails('feeding-details', data.feeding && data.feeding.details);
    renderKeypoints(document.getElementById('environment-keypoints'), data.environment && data.environment.keyPoints);
    renderDetails('environment-details', data.environment && data.environment.details);
    renderHazards(data);
  }

  /* -------------------------------------------------------------- sources */

  function sourceBadge(shop) {
    if (shop.type === 'shelter') return { text: 'Shelter or rescue', cls: 'badge-shelter' };
    if (shop.place_id) return { text: 'Local seller', cls: 'badge-seller' };
    return { text: 'Online listing', cls: 'badge-online' };
  }

  function mapsHref(shop) {
    if (shop.gps_coordinates) {
      return 'https://www.google.com/maps/search/?api=1&query=' +
        shop.gps_coordinates.lat + ',' + shop.gps_coordinates.lng;
    }
    var q = [shop.name, shop.address].filter(Boolean).join(' ');
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }

  function renderSources(shops) {
    sourcesError.classList.add('hidden');
    sourcesEmpty.classList.add('hidden');
    sourcesGrid.innerHTML = '';

    if (!shops || !shops.length) {
      sourcesEmpty.textContent = 'No sources found for that location yet. Try a nearby city or region.';
      sourcesEmpty.classList.remove('hidden');
      return;
    }

    // Shelters and rescues first, then best rated, then online listings.
    var ordered = shops.slice().sort(function (a, b) {
      var shelterA = a.type === 'shelter' ? 0 : 1;
      var shelterB = b.type === 'shelter' ? 0 : 1;
      if (shelterA !== shelterB) return shelterA - shelterB;
      var ratingA = a.rating || 0;
      var ratingB = b.rating || 0;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return (a.name || '').localeCompare(b.name || '');
    });

    sourcesGrid.innerHTML = ordered.map(function (shop) {
      var badge = sourceBadge(shop);
      var stars = shop.rating
        ? '<span class="source-rating" aria-label="Rated ' + shop.rating + ' out of 5">' +
          '★ ' + shop.rating + (shop.reviews ? ' <span class="source-reviews">(' + shop.reviews + ')</span>' : '') +
          '</span>'
        : '';
      var address = shop.address
        ? '<p class="source-address">' + escapeHtml(shop.address) + '</p>'
        : '';
      var phone = shop.phone
        ? '<a class="source-phone" href="tel:' + escapeHtml(shop.phone.replace(/\s/g, '')) + '">' +
          escapeHtml(shop.phone) + '</a>'
        : '';
      var maps = mapsHref(shop);
      var link = shop.url
        ? '<a class="source-link" href="' + escapeHtml(shop.url) + '" target="_blank" rel="noopener noreferrer">Visit site</a>'
        : (maps ? '<a class="source-link" href="' + escapeHtml(maps) + '" target="_blank" rel="noopener noreferrer">View map</a>' : '');
      var caution = badge.cls === 'badge-shelter' ? '' :
        '<p class="source-caution">Verify health records and visit before paying.</p>';

      return '<article class="source-card">' +
        '<div class="source-card-head">' +
          '<h3 class="source-name">' + escapeHtml(shop.name || 'Unnamed') + '</h3>' +
          '<span class="source-badge ' + badge.cls + '">' + badge.text + '</span>' +
        '</div>' +
        stars + address + phone +
        (shop.snippet ? '<p class="source-snippet">' + escapeHtml(shop.snippet) + '</p>' : '') +
        caution + link +
        '</article>';
    }).join('');
  }

  function loadSources(petType, breed, location) {
    sourcesLocation = location || '';
    sourcesGrid.innerHTML = '';
    sourcesError.classList.add('hidden');
    sourcesEmpty.classList.add('hidden');

    if (!sourcesLocation) {
      sourcesLocationPrompt.classList.remove('hidden');
      sourcesLoading.classList.add('hidden');
      return;
    }

    sourcesLocationPrompt.classList.add('hidden');
    sourcesLoading.classList.remove('hidden');

    fetch('/api/pet-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petType: petType, breed: breed, location: sourcesLocation })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result) {
        sourcesLoading.classList.add('hidden');
        if (!result.ok) {
          showSourcesError(result.status);
          return;
        }
        renderSources(result.body.shops);
      })
      .catch(function () {
        sourcesLoading.classList.add('hidden');
        showSourcesError(0);
      });
  }

  function showSourcesError(status) {
    sourcesGrid.innerHTML = '';
    var message = status === 429
      ? 'Source search hit a rate limit. Try again in a minute.'
      : 'Could not load nearby sources right now.';
    sourcesError.innerHTML =
      '<span>' + message + '</span> <button type="button" class="btn btn-small" id="sources-retry-btn">Try again</button>';
    sourcesError.classList.remove('hidden');
    var retry = document.getElementById('sources-retry-btn');
    if (retry && lastRequest) {
      retry.addEventListener('click', function () {
        loadSources(lastRequest.petType, lastRequest.breed, sourcesLocation || sourcesLocationInput.value.trim());
      });
    }
  }

  /* -------------------------------------------------------------- submit  */

  function submit(event) {
    if (event) event.preventDefault();

    var breed = validateBreed();
    var weightState = validateWeight();

    if (!breed || !weightState) {
      formError.textContent = 'Check the highlighted field before searching.';
      formError.classList.remove('hidden');
      var firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }
    formError.classList.add('hidden');

    var request = {
      petType: petTypeSelect.value,
      breed: breed,
      ageStage: ageSelect.value,
      weight: weightState.weight,
      weightUnit: weightState.weightUnit,
      location: locationInput.value.trim()
    };
    lastRequest = request;
    updateUrl(request);

    setLoading(true);

    fetch('/api/pet-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
      })
      .then(function (result) {
        setLoading(false);
        if (!result.ok) {
          showError(describeError(result.status, result.body));
          return;
        }
        hideError();
        render(result.body);
        sourcesSection.classList.remove('hidden');
        results.classList.remove('hidden');
        if (resultsHeading) resultsHeading.focus();
        loadSources(request.petType, request.breed, request.location);
      })
      .catch(function () {
        setLoading(false);
        showError(ERROR_COPY.network);
      });
  }

  /* ------------------------------------------------------------ wire-up   */

  petTypeSelect.addEventListener('change', onPetTypeChange);

  breedInput.addEventListener('input', function () {
    if (breedInput.getAttribute('aria-invalid') === 'true') validateBreed();
  });
  weightInput.addEventListener('input', function () {
    if (weightInput.getAttribute('aria-invalid') === 'true') validateWeight();
  });

  form.addEventListener('submit', submit);
  retryBtn.addEventListener('click', function () { if (lastRequest) submit(); });

  sourcesLocationBtn.addEventListener('click', function () {
    var value = sourcesLocationInput.value.trim();
    if (!value) {
      sourcesLocationInput.focus();
      return;
    }
    locationInput.value = value;
    if (lastRequest) {
      lastRequest.location = value;
      updateUrl(lastRequest);
    }
    loadSources(lastRequest ? lastRequest.petType : petTypeSelect.value,
      lastRequest ? lastRequest.breed : breedInput.value.trim(), value);
  });

  // Restore state from the URL and run automatically when it is complete.
  (function initFromUrl() {
    var params = getUrlParams();
    if (!params.petType || !params.breed) {
      applyNoun('');
      populateStages('');
      return;
    }
    petTypeSelect.value = params.petType;
    applyNoun(params.petType);
    populateBreeds(params.petType);
    populateStages(params.petType, params.ageStage);
    breedInput.value = params.breed;
    weightInput.value = params.weight;
    weightUnitSelect.value = params.weightUnit || 'kg';
    locationInput.value = params.location;
    submit();
  })();
})();