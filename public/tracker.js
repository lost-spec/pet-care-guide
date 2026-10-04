(function () {
  'use strict';

  var STORAGE_KEY = 'petCareGuide.tracker.v1';
  var PET_KEY = 'petCareGuide.pet.v1';

  // Declared first so the data-layer slice exercised by scripts/check.js covers
  // the escaping helper too. Pet names are user input and end up in innerHTML.
  function escapeHtml(value) {
    if (window.PetGuide && typeof window.PetGuide.escapeHtml === 'function') {
      return window.PetGuide.escapeHtml(value);
    }
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------ data layer */

  function blankEntry() {
    return { calories: '', minutes: '', weight: '', weightUnit: 'kg', notes: '' };
  }

  function blankState() {
    return {
      version: 1,
      profile: { name: '', petType: '', breed: '', ageStage: '', diet: '', calorieTarget: '' },
      entries: {}
    };
  }

  // Null when pet-data.js is unavailable, so validation is skipped rather than
  // throwing. The tracker is only ever rendered with pet-data.js loaded.
  function knownTypes() {
    if (!window.PetData || typeof window.PetData.types !== 'function') return null;
    try {
      var list = window.PetData.types();
      return list && list.length ? list : null;
    } catch (err) {
      return null;
    }
  }

  function cleanText(value, max) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function numberOrBlank(value, min, max) {
    if (value === '' || value === null || value === undefined) return '';
    var num = Number(value);
    if (!isFinite(num)) return '';
    num = Math.min(max, Math.max(min, num));
    return String(Math.round(num * 10) / 10);
  }

  function normalise(raw) {
    var out = blankState();
    if (!raw || typeof raw !== 'object') return out;

    var profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
    var types = knownTypes();
    var type = cleanText(profile.petType, 40);
    if (types && types.indexOf(type) === -1) type = '';
    out.profile.name = cleanText(profile.name, 40);
    out.profile.petType = type;
    out.profile.breed = cleanText(profile.breed, 60);
    out.profile.ageStage = cleanText(profile.ageStage, 40);
    out.profile.diet = cleanText(profile.diet, 120);
    out.profile.calorieTarget = numberOrBlank(profile.calorieTarget, 0, 5000);

    var entries = raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
    Object.keys(entries).forEach(function (iso) {
      if (!isIsoDate(iso)) return;
      var source = entries[iso] && typeof entries[iso] === 'object' ? entries[iso] : {};
      var entry = blankEntry();
      // Checklists are species specific, so the set of boolean keys changes with
      // the pet type. Carry across whatever was stored rather than a fixed list,
      // otherwise switching species would silently drop ticked items.
      Object.keys(source).forEach(function (key) {
        if (typeof source[key] === 'boolean') entry[key] = source[key];
      });
      entry.calories = numberOrBlank(source.calories, 0, 5000);
      entry.minutes = numberOrBlank(source.minutes, 0, 600);
      entry.weight = numberOrBlank(source.weight, 0, 2000);
      entry.weightUnit = source.weightUnit === 'lb' ? 'lb' : 'kg';
      entry.notes = typeof source.notes === 'string' ? source.notes.slice(0, 500) : '';
      out.entries[iso] = entry;
    });

    return out;
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      return normalise(JSON.parse(raw));
    } catch (err) {
      return blankState();
    }
  }

  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function erase() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  // The pet the user searched for on the care guide. The tracker refuses to
  // show a routine until this exists, so nothing is built for the wrong animal.
  function readPetProfile() {
    try {
      var raw = window.localStorage.getItem(PET_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var type = cleanText(parsed.petType, 40);
      if (!type) return null;
      var types = knownTypes();
      if (types && types.indexOf(type) === -1) return null;
      return {
        petType: type,
        breed: cleanText(parsed.breed, 60),
        ageStage: cleanText(parsed.ageStage, 40)
      };
    } catch (err) {
      return null;
    }
  }

  /* ------------------------------------------------------------ date maths */

  function isIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function todayIso() {
    return toIso(new Date());
  }

  function toIso(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    var m = String(date.getMonth() + 1);
    var d = String(date.getDate());
    return date.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (d.length < 2 ? '0' + d : d);
  }

  function shiftIso(iso, days) {
    if (!isIsoDate(iso)) return '';
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    return toIso(date);
  }

  function labelFor(iso) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function weekdayFor(iso) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function relativeDay(iso) {
    var today = todayIso();
    if (iso === today) return 'Today';
    if (iso === shiftIso(today, -1)) return 'Yesterday';
    if (iso === shiftIso(today, 1)) return 'Tomorrow';
    return '';
  }

  /* ---------------------------------------------------------- species data */

  // Falls back to the dog routine if a species ever gains breeds before its own
  // routine is written, so the checklist is never empty.
  function routineFor(petType) {
    if (window.PetData && typeof window.PetData.routine === 'function') {
      try {
        var list = window.PetData.routine(petType);
        if (list && list.length) return list;
      } catch (err) {
        /* fall through */
      }
    }
    return [
      { key: 'fed', label: 'Fed their meal', icon: '🍚', role: 'food' },
      { key: 'water', label: 'Fresh water available', icon: '💧', role: 'water' },
      { key: 'activity', label: 'Exercise', icon: '🐾', role: 'activity' },
      { key: 'hygiene', label: 'Washed or groomed', icon: '🛁', role: 'hygiene' },
      { key: 'health', label: 'Medication or supplement', icon: '💊', role: 'health' }
    ];
  }

  function roleKey(petType, role) {
    var items = routineFor(petType);
    for (var i = 0; i < items.length; i++) {
      if (items[i].role === role) return items[i].key;
    }
    return '';
  }

  function dietNoteFor(petType, ageStage) {
    if (window.PetData && typeof window.PetData.dietNote === 'function') {
      try {
        return window.PetData.dietNote(petType, ageStage);
      } catch (err) {
        /* fall through */
      }
    }
    return 'Feed a complete food for their species, measured rather than eyeballed.';
  }

  /* --------------------------------------------------------------- derived */

  function entryFor(iso) {
    return state.entries[iso] || null;
  }

  function entryTouched(entry, petType) {
    if (!entry) return false;
    var items = routineFor(petType);
    for (var i = 0; i < items.length; i++) {
      if (entry[items[i].key] === true) return true;
    }
    return entry.calories !== '' || entry.minutes !== '' || entry.weight !== '' || !!entry.notes;
  }

  function calorieAverage() {
    var total = 0;
    var count = 0;
    var today = todayIso();
    for (var i = 0; i < 7; i++) {
      var entry = state.entries[shiftIso(today, -i)];
      if (entry && entry.calories !== '') {
        total += Number(entry.calories);
        count++;
      }
    }
    return count ? Math.round(total / count) : 0;
  }

  // Counts back from today. A gap yesterday stops the streak rather than
  // skipping it, so the number reflects days actually fed in a row.
  function fedStreak(petType) {
    var foodKey = roleKey(petType, 'food');
    if (!foodKey) return 0;
    var streak = 0;
    var today = todayIso();
    var start = state.entries[today] && state.entries[today][foodKey] === true ? 0 : 1;
    for (var i = start; i < 400; i++) {
      var entry = state.entries[shiftIso(today, -i)];
      if (entry && entry[foodKey] === true) streak++;
      else break;
    }
    return streak;
  }

  // Exposed for scripts/check.js so the storage and date maths can be tested
  // without a browser. Declared above the DOM wiring so the whole pure-data
  // layer can be exercised on its own.
  window.PetTracker = {
    blankEntry: blankEntry,
    blankState: blankState,
    normalise: normalise,
    numberOrBlank: numberOrBlank,
    cleanText: cleanText,
    readPetProfile: readPetProfile,
    escapeHtml: escapeHtml,
    toIso: toIso,
    shiftIso: shiftIso,
    isIsoDate: isIsoDate,
    fedStreak: fedStreak
  };

  /* --------------------------------------------------------------- wiring */

  var el = null;
  var state = blankState();
  var activeDate = todayIso();

  function setShown(node, visible) {
    if (!node) return;
    // The project hides with a .hidden class rather than the hidden attribute,
    // because .info-card and .week-stats are display:grid and would win.
    node.classList.toggle('hidden', !visible);
  }

  function buildChecklist() {
    var items = routineFor(state.profile.petType);
    var entry = entryFor(activeDate) || blankEntry();

    el.checklist.innerHTML = '';
    var legend = document.createElement('legend');
    legend.className = 'tracker-legend';
    legend.textContent = 'Done today';
    el.checklist.appendChild(legend);

    items.forEach(function (item) {
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'chk-' + item.key;
      input.setAttribute('data-key', item.key);
      input.checked = entry[item.key] === true;

      var chip = document.createElement('label');
      chip.className = 'check-chip';
      chip.setAttribute('for', input.id);

      var body = document.createElement('span');
      body.className = 'check-chip-body';

      var icon = document.createElement('span');
      icon.className = 'check-chip-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon || '';

      var text = document.createElement('span');
      text.className = 'check-chip-text';
      text.textContent = item.label;

      body.appendChild(icon);
      body.appendChild(text);
      chip.appendChild(input);
      chip.appendChild(body);
      el.checklist.appendChild(chip);
    });
  }

  function applySpecies() {
    var type = state.profile.petType;
    var hasActivity = roleKey(type, 'activity') !== '';

    el.dietNote.textContent = dietNoteFor(type, state.profile.ageStage);
    setShown(el.minutesField, hasActivity);
    setShown(el.statExerciseBox, hasActivity);
    buildChecklist();
  }

  function fillProfile() {
    el.name.value = state.profile.name;
    el.type.value = state.profile.petType;
    el.diet.value = state.profile.diet;
    el.target.value = state.profile.calorieTarget;
    fillProfileSummary();
  }

  // "Clear this day" is only meaningful once the day has something in it. This
  // has to be refreshed after every save, not just when loading a day, or the
  // button stays disabled after the first tick and never becomes clickable.
  function updateClearButton() {
    var has = !!state.entries[activeDate];
    el.clearDay.disabled = !has;
    el.clearDay.title = has ? '' : 'Nothing logged on this day yet';
  }

  /* ------------------------------------------------------------ AI review */

  // Only reviewed when something was actually logged, so the button cannot ask
  // the model to review an empty day.
  function reviewPayload() {
    var petType = state.profile.petType;
    var entry = state.entries[activeDate];
    if (!entry || !entryTouched(entry, petType)) return null;

    return {
      petType: petType,
      breed: state.profile.breed,
      ageStage: state.profile.ageStage,
      diet: state.profile.diet,
      calorieTarget: state.profile.calorieTarget,
      date: activeDate,
      calories: entry.calories,
      minutes: entry.minutes,
      weight: entry.weight,
      weightUnit: entry.weightUnit,
      notes: entry.notes,
      routine: routineFor(petType).map(function (item) {
        return { label: item.label, done: entry[item.key] === true };
      }),
      week: {
        fedDays: countDays(roleKey(petType, 'food')),
        activeDays: countDays(roleKey(petType, 'activity')),
        avgCalories: calorieAverage(),
        streak: fedStreak(petType)
      }
    };
  }

  function countDays(key) {
    if (!key) return 0;
    var today = todayIso();
    var total = 0;
    for (var i = 0; i < 7; i++) {
      var entry = state.entries[shiftIso(today, -i)];
      if (entry && entry[key] === true) total++;
    }
    return total;
  }

  var VERDICT_TEXT = { good: 'Looks good', watch: 'Worth watching', concern: 'Needs attention' };

  function renderReview(data) {
    if (!data || typeof data !== 'object') return;

    el.reviewVerdict.textContent = VERDICT_TEXT[data.verdict] || VERDICT_TEXT.watch;
    el.reviewVerdict.className = 'tracker-verdict tracker-verdict-' +
      (VERDICT_TEXT[data.verdict] ? data.verdict : 'watch');
    el.reviewHeadline.textContent = data.headline || '';

    var lists = el.reviewLists;
    lists.innerHTML = '';
    [
      { title: 'Going well', items: data.positives, cls: 'review-good' },
      { title: 'Keep an eye on', items: data.concerns, cls: 'review-concern' },
      { title: 'Suggestions', items: data.tips, cls: 'review-tip' }
    ].forEach(function (group) {
      if (!Array.isArray(group.items) || !group.items.length) return;
      var block = document.createElement('div');
      block.className = 'tracker-review-block ' + group.cls;

      var heading = document.createElement('h3');
      heading.className = 'tracker-review-block-title';
      heading.textContent = group.title;

      var list = document.createElement('ul');
      group.items.forEach(function (item) {
        var li = document.createElement('li');
        // textContent, never innerHTML: this is model output.
        li.textContent = String(item);
        list.appendChild(li);
      });

      block.appendChild(heading);
      block.appendChild(list);
      lists.appendChild(block);
    });

    if (data.vetNote) {
      el.reviewVet.textContent = data.vetNote;
      setShown(el.reviewVet, true);
    } else {
      setShown(el.reviewVet, false);
    }

    setShown(el.reviewResult, true);
  }

  function describeReviewError(status, body) {
    if (status === 503 && body && body.code === 'ai_not_configured') {
      return 'Reviews need the AI key to be set on the server, so this is unavailable right now.';
    }
    if (status === 429) return 'The AI is rate limiting us. Wait a moment and try again.';
    if (status === 400) return 'That day could not be read: ' + ((body && body.error) || 'bad request');
    return 'Could not review this day. Please try again.';
  }

  function requestReview() {
    // Save first so the review sees what is on screen.
    persist();

    var payload = reviewPayload();
    if (!payload) {
      el.reviewStatus.textContent = 'Tick something or add a number first, then ask for a review.';
      return;
    }

    el.reviewBtn.disabled = true;
    el.reviewBtn.textContent = 'Reviewing\u2026';
    el.reviewStatus.textContent = '';
    setShown(el.reviewResult, false);

    fetch('/api/tracker-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
      })
      .then(function (result) {
        if (!result.ok) {
          el.reviewStatus.textContent = describeReviewError(result.status, result.body);
          return;
        }
        renderReview(result.body);
      })
      .catch(function () {
        el.reviewStatus.textContent = 'Could not reach the server. Check your connection and try again.';
      })
      .then(function () {
        el.reviewBtn.disabled = false;
        el.reviewBtn.textContent = 'Ask for a review of this day';
      });
  }

  function fillDay(iso) {
    var entry = entryFor(iso) || blankEntry();
    var boxes = el.checklist.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = entry[boxes[i].getAttribute('data-key')] === true;
    }
    el.calories.value = entry.calories;
    el.minutes.value = entry.minutes;
    el.weight.value = entry.weight;
    el.weightUnit.value = entry.weightUnit;
    el.notes.value = entry.notes;

    var relative = relativeDay(iso);
    el.dayHint.textContent = relative || labelFor(iso);
    updateClearButton();
  }

  function collectDay() {
    var entry = blankEntry();
    var boxes = el.checklist.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < boxes.length; i++) {
      entry[boxes[i].getAttribute('data-key')] = boxes[i].checked;
    }
    entry.calories = el.calories.value;
    entry.minutes = el.minutes.value;
    entry.weight = el.weight.value;
    entry.weightUnit = el.weightUnit.value;
    entry.notes = el.notes.value;
    return entry;
  }

  function saveStatus() {
    var ok = save(state);
    if (!ok) {
      el.storageNote.textContent =
        'This browser would not let the tracker save. It is full or blocking storage, so your entries will be lost when you leave.';
      return;
    }
    el.saveStatus.textContent = 'Saved';
    if (saveStatus.timer) window.clearTimeout(saveStatus.timer);
    saveStatus.timer = window.setTimeout(function () {
      el.saveStatus.textContent = '';
    }, 1600);
  }

  function renderWeek() {
    var today = todayIso();
    var petType = state.profile.petType;
    var items = routineFor(petType);
    var dots = items.slice(0, 4).map(function (item) {
      return { key: item.key, icon: item.icon };
    });

    var hasAny = false;
    var fedDays = 0;
    var activeDays = 0;
    var foodKey = roleKey(petType, 'food');
    var activityKey = roleKey(petType, 'activity');

    var cells = '';
    for (var i = 6; i >= 0; i--) {
      var iso = shiftIso(today, -i);
      var entry = state.entries[iso];
      if (entryTouched(entry, petType)) hasAny = true;
      if (foodKey && entry && entry[foodKey] === true) fedDays++;
      if (activityKey && entry && entry[activityKey] === true) activeDays++;

      var marks = '';
      for (var d = 0; d < dots.length; d++) {
        if (entry && entry[dots[d].key] === true) {
          marks += '<span class="week-dot-on" aria-hidden="true">' + escapeHtml(dots[d].icon) + '</span>';
        } else {
          marks += '<span class="week-dot" aria-hidden="true"></span>';
        }
      }

      var className = 'week-cell';
      if (iso === today) className += ' week-cell-today';
      if (iso === activeDate) className += ' week-cell-active';
      var caption = labelFor(iso) + (entryTouched(entry, petType) ? ', logged' : ', nothing logged');

      cells +=
        '<button type="button" class="' + className + '" role="listitem" data-iso="' + iso + '"' +
        ' aria-current="' + (iso === activeDate ? 'date' : 'false') + '"' +
        ' aria-label="' + escapeHtml(caption) + '">' +
        '<span class="week-day">' + escapeHtml(weekdayFor(iso)) + '</span>' +
        '<span class="week-date">' + escapeHtml(iso.slice(8)) + '</span>' +
        '<span class="week-dots">' + marks + '</span>' +
        '</button>';
    }
    el.weekStrip.innerHTML = cells;

    setShown(el.weekEmpty, !hasAny);
    setShown(el.weekStats, hasAny);
    if (hasAny) {
      el.statFed.textContent = String(fedDays);
      el.statExercise.textContent = String(activeDays);
      el.statCalories.textContent = String(calorieAverage());
      el.statStreak.textContent = String(fedStreak(petType));
    }

    var target = Number(state.profile.calorieTarget);
    var average = calorieAverage();
    if (target > 0 && average > 0) {
      var drift = (average - target) / target;
      if (Math.abs(drift) >= 0.15) {
        setShown(el.warning, true);
        el.warning.textContent = drift > 0
          ? 'Your recent average is ' + average + ' kcal, above your ' + target + ' kcal target by ' +
            Math.round(drift * 100) + '%. Worth a word with your vet.'
          : 'Your recent average is ' + average + ' kcal, below your ' + target + ' kcal target by ' +
            Math.round(Math.abs(drift) * 100) + '%. Worth a word with your vet.';
      } else {
        setShown(el.warning, false);
      }
    } else {
      setShown(el.warning, false);
    }
  }

  function render() {
    fillProfile();
    fillDay(activeDate);
    renderWeek();
  }

  function persist() {
    state.entries[activeDate] = collectDay();
    if (!entryTouched(state.entries[activeDate], state.profile.petType)) {
      delete state.entries[activeDate];
    }
    saveStatus();
    renderWeek();
    updateClearButton();
  }

  function populateTypes() {
    var list = window.PetData && typeof window.PetData.types === 'function' ? window.PetData.types() : [];
    el.type.innerHTML = '';
    list.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      el.type.appendChild(option);
    });
  }

  function clearDay() {
    delete state.entries[activeDate];
    save(state);
    fillDay(activeDate);
    renderWeek();
    el.saveStatus.textContent = 'Day cleared';
  }

  function clearAll() {
    if (!window.confirm('Delete every day you have logged, and your pet details? This cannot be undone.')) return;
    erase();
    state = blankState();
    state.profile.petType = el.type.value;
    fillProfile();
    fillDay(activeDate);
    renderWeek();
    el.saveStatus.textContent = 'All tracker data deleted';
  }

  function openDay(iso) {
    activeDate = iso;
    el.date.value = iso;
    // A review belongs to one day, so it must not linger over another date.
    setShown(el.reviewResult, false);
    el.reviewStatus.textContent = '';
    fillDay(iso);
    renderWeek();
  }

  function bind() {
    el.date.addEventListener('change', function () {
      openDay(isIsoDate(el.date.value) ? el.date.value : todayIso());
    });

    el.checklist.addEventListener('change', persist);
    el.calories.addEventListener('input', persist);
    el.minutes.addEventListener('input', persist);
    el.weight.addEventListener('input', persist);
    el.weightUnit.addEventListener('change', persist);
    el.notes.addEventListener('input', persist);

    el.name.addEventListener('input', function () {
      state.profile.name = cleanText(el.name.value, 40);
      fillProfileSummary();
      save(state);
    });
    el.diet.addEventListener('input', function () {
      state.profile.diet = cleanText(el.diet.value, 120);
      save(state);
    });
    el.target.addEventListener('input', function () {
      state.profile.calorieTarget = numberOrBlank(el.target.value, 0, 5000);
      save(state);
      renderWeek();
    });

    // Changing species rebuilds the checklist and the diet note. Keys shared
    // between the two routines keep their ticked state via the stored entry.
    el.type.addEventListener('change', function () {
      state.profile.petType = el.type.value;
      applySpecies();
      render();
      save(state);
    });

    el.clearDay.addEventListener('click', clearDay);
    el.clearAll.addEventListener('click', clearAll);
    el.reviewBtn.addEventListener('click', requestReview);

    el.weekStrip.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.week-cell') : null;
      if (!button) return;
      var iso = button.getAttribute('data-iso');
      if (isIsoDate(iso)) openDay(iso);
    });
  }

  function fillProfileSummary() {
    var bits = [];
    if (state.profile.name) bits.push(state.profile.name);
    if (state.profile.breed) bits.push(state.profile.breed);
    if (state.profile.ageStage) bits.push(state.profile.ageStage);
    el.profileSummary.textContent = bits.length ? bits.join(' \u00b7 ') : 'Add your pet\u2019s details above.';
  }

  function init() {
    el = {
      gate: document.getElementById('tracker-gate'),
      body: document.getElementById('tracker-body'),
      tagline: document.getElementById('hero-tagline'),
      name: document.getElementById('pet-name'),
      type: document.getElementById('pet-type'),
      diet: document.getElementById('pet-diet'),
      target: document.getElementById('pet-calorie-target'),
      profileSummary: document.getElementById('profile-summary'),
      dietNote: document.getElementById('diet-note'),
      checklist: document.getElementById('checklist'),
      date: document.getElementById('entry-date'),
      dayHint: document.getElementById('entry-rel'),
      calories: document.getElementById('entry-calories'),
      minutes: document.getElementById('entry-minutes'),
      minutesField: document.getElementById('minutes-field'),
      weight: document.getElementById('entry-weight'),
      weightUnit: document.getElementById('entry-weight-unit'),
      notes: document.getElementById('entry-notes'),
      clearDay: document.getElementById('clear-day-btn'),
      clearAll: document.getElementById('clear-all-btn'),
      reviewBtn: document.getElementById('review-btn'),
      reviewStatus: document.getElementById('review-status'),
      reviewResult: document.getElementById('review-result'),
      reviewVerdict: document.getElementById('review-verdict'),
      reviewHeadline: document.getElementById('review-headline'),
      reviewLists: document.getElementById('review-lists'),
      reviewVet: document.getElementById('review-vet'),
      weekStrip: document.getElementById('week-strip'),
      weekEmpty: document.getElementById('week-empty'),
      weekStats: document.getElementById('week-stats'),
      statFed: document.getElementById('stat-fed'),
      statExercise: document.getElementById('stat-exercise'),
      statExerciseBox: document.getElementById('stat-exercise-box'),
      statCalories: document.getElementById('stat-calories'),
      statStreak: document.getElementById('stat-streak'),
      warning: document.getElementById('tracker-warning'),
      saveStatus: document.getElementById('save-status'),
      storageNote: document.getElementById('storage-note')
    };

    populateTypes();
    state = load();

    // No pet from the care guide yet, so there is nothing sensible to build a
    // routine from. Ask for the details instead of showing a generic checklist.
    var pet = readPetProfile();
    if (!pet) {
      setShown(el.gate, true);
      setShown(el.body, false);
      return;
    }

    if (!state.profile.petType) state.profile.petType = pet.petType;
    if (!state.profile.breed && pet.breed) state.profile.breed = pet.breed;
    if (!state.profile.ageStage && pet.ageStage) state.profile.ageStage = pet.ageStage;
    if (!state.profile.name && pet.breed) state.profile.name = pet.breed;

    activeDate = todayIso();
    el.date.value = activeDate;

    setShown(el.gate, false);
    setShown(el.body, true);

    applySpecies();
    render();
    bind();

    var noun = state.profile.name || state.profile.breed || state.profile.petType;
    if (el.tagline && noun) {
      el.tagline.textContent = 'Routine and diet for your ' + noun.toLowerCase();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();