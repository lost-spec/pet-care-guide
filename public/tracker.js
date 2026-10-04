/* Daily care tracker.
   Everything lives in localStorage: the app has no accounts and no database,
   so this is deliberately device-local rather than uploaded anywhere. */
(function () {
  'use strict';

  var STORAGE_KEY = 'petCareGuide.tracker.v1';
  var CHECK_KEYS = ['fed', 'water', 'exercise', 'wash', 'meds', 'potty'];
  var WEEK_DAYS = 7;

  var el = {
    petName: document.getElementById('pet-name'),
    petType: document.getElementById('pet-type'),
    petDiet: document.getElementById('pet-diet'),
    petCalorieTarget: document.getElementById('pet-calorie-target'),
    profileSummary: document.getElementById('profile-summary'),
    entryDate: document.getElementById('entry-date'),
    entryRel: document.getElementById('entry-rel'),
    calories: document.getElementById('entry-calories'),
    minutes: document.getElementById('entry-minutes'),
    weight: document.getElementById('entry-weight'),
    weightUnit: document.getElementById('entry-weight-unit'),
    notes: document.getElementById('entry-notes'),
    saveStatus: document.getElementById('save-status'),
    clearDay: document.getElementById('clear-day-btn'),
    clearAll: document.getElementById('clear-all-btn'),
    weekStrip: document.getElementById('week-strip'),
    weekEmpty: document.getElementById('week-empty'),
    weekStats: document.getElementById('week-stats'),
    statFed: document.getElementById('stat-fed'),
    statExercise: document.getElementById('stat-exercise'),
    statCalories: document.getElementById('stat-calories'),
    statStreak: document.getElementById('stat-streak'),
    warning: document.getElementById('tracker-warning'),
    storageNote: document.getElementById('storage-note')
  };

  var boxes = {};
  CHECK_KEYS.forEach(function (key) {
    boxes[key] = document.querySelector('input[data-key="' + key + '"]');
  });

  /* ------------------------------------------------------------ storage */

  var storageWorks = true;

  function blankEntry() {
    return {
      fed: false, water: false, exercise: false,
      wash: false, meds: false, potty: false,
      calories: '', minutes: '', weight: '', weightUnit: 'kg', notes: ''
    };
  }

  function blankState() {
    return { version: 1, profile: { name: '', type: '', diet: '', calorieTarget: '' }, entries: {} };
  }

  // Merge stored data over a blank shape so an older or partial record can
  // never leave a field undefined.
  function normalise(raw) {
    var base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.profile && typeof raw.profile === 'object') {
      base.profile.name = String(raw.profile.name || '').slice(0, 40);
      base.profile.type = String(raw.profile.type || '');
      base.profile.diet = String(raw.profile.diet || '').slice(0, 80);
      base.profile.calorieTarget = numberOrBlank(raw.profile.calorieTarget, 0, 5000);
    }
    if (raw.entries && typeof raw.entries === 'object') {
      Object.keys(raw.entries).forEach(function (date) {
        if (!isIsoDate(date)) return;
        var entry = blankEntry();
        var stored = raw.entries[date] || {};
        CHECK_KEYS.forEach(function (key) { entry[key] = stored[key] === true; });
        entry.calories = numberOrBlank(stored.calories, 0, 5000);
        entry.minutes = numberOrBlank(stored.minutes, 0, 600);
        entry.weight = numberOrBlank(stored.weight, 0, 2000);
        entry.weightUnit = stored.weightUnit === 'lb' ? 'lb' : 'kg';
        entry.notes = String(stored.notes || '').slice(0, 500);
        base.entries[date] = entry;
      });
    }
    return base;
  }

  function numberOrBlank(value, min, max) {
    if (value === '' || value === null || value === undefined) return '';
    var num = Number(value);
    if (!isFinite(num)) return '';
    return String(Math.min(Math.max(num, min), max));
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return normalise(raw ? JSON.parse(raw) : null);
    } catch (error) {
      // Private browsing or a blocked storage partition. The tracker still
      // works for this visit, it just cannot remember.
      storageWorks = false;
      return blankState();
    }
  }

  function save(state) {
    if (!storageWorks) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      storageWorks = false;
      return false;
    }
  }

  function erase() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* nothing to do */
    }
  }

  /* --------------------------------------------------------------- dates */

  function isIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function todayIso() {
    return toIso(new Date());
  }

  function toIso(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function shiftIso(iso, days) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    return toIso(date);
  }

  function labelFor(iso) {
    var today = todayIso();
    if (iso === today) return 'Today';
    if (iso === shiftIso(today, -1)) return 'Yesterday';
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function weekdayFor(iso) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
  }

  function relativeDay(iso) {
    var today = todayIso();
    if (iso === today) return 'Today';
    if (iso === shiftIso(today, -1)) return 'Yesterday';
    if (iso === shiftIso(today, 1)) return 'Tomorrow';
    return labelFor(iso);
  }

  /* -------------------------------------------------------------- render */

  var state = load();
  var activeDate = todayIso();

  function entryFor(iso) {
    return state.entries[iso] || blankEntry();
  }

  function fillProfile() {
    el.petName.value = state.profile.name;
    el.petDiet.value = state.profile.diet;
    el.petCalorieTarget.value = state.profile.calorieTarget;
    if (state.profile.type) el.petType.value = state.profile.type;

    var bits = [];
    if (state.profile.name) bits.push(state.profile.name);
    if (state.profile.type) bits.push(state.profile.type);
    if (state.profile.diet) bits.push(state.profile.diet);
    el.profileSummary.textContent = bits.length ? bits.join(' · ') : 'Add your pet’s details above.';
  }

  function fillDay(iso) {
    activeDate = isIsoDate(iso) ? iso : todayIso();
    el.entryDate.value = activeDate;
    el.entryRel.textContent = relativeDay(activeDate);

    var entry = entryFor(activeDate);
    CHECK_KEYS.forEach(function (key) {
      if (boxes[key]) boxes[key].checked = entry[key];
    });
    el.calories.value = entry.calories;
    el.minutes.value = entry.minutes;
    el.weight.value = entry.weight;
    el.weightUnit.value = entry.weightUnit;
    el.notes.value = entry.notes;
    el.clearDay.disabled = !state.entries[activeDate];
  }

  function collectDay() {
    var entry = blankEntry();
    CHECK_KEYS.forEach(function (key) {
      if (boxes[key]) entry[key] = boxes[key].checked;
    });
    entry.calories = numberOrBlank(el.calories.value, 0, 5000);
    entry.minutes = numberOrBlank(el.minutes.value, 0, 600);
    entry.weight = numberOrBlank(el.weight.value, 0, 2000);
    entry.weightUnit = el.weightUnit.value === 'lb' ? 'lb' : 'kg';
    entry.notes = el.notes.value.slice(0, 500);

    var touched = CHECK_KEYS.some(function (key) { return entry[key]; }) ||
      entry.calories !== '' || entry.minutes !== '' || entry.weight !== '' || entry.notes !== '';

    if (!touched) delete state.entries[activeDate];
    else state.entries[activeDate] = entry;
    return touched;
  }

  function calorieAverage() {
    var values = [];
    for (var i = WEEK_DAYS - 1; i >= 0; i--) {
      var entry = state.entries[shiftIso(todayIso(), -i)];
      if (entry && entry.calories !== '') values.push(Number(entry.calories));
    }
    if (!values.length) return null;
    return Math.round(values.reduce(function (a, b) { return a + b; }, 0) / values.length);
  }

  function fedStreak() {
    // Count back from today. Today not yet ticked does not break the streak,
    // otherwise every morning would read as zero.
    var streak = 0;
    var start = state.entries[todayIso()] && state.entries[todayIso()].fed ? 0 : 1;
    for (var i = start; i < 400; i++) {
      var entry = state.entries[shiftIso(todayIso(), -i)];
      if (entry && entry.fed) streak++;
      else break;
    }
    return streak;
  }

  // The app hides things with a .hidden class (display:none !important). A
  // class rule like display:grid beats the native [hidden] attribute, so use
  // the same mechanism as the rest of the site.
  function setShown(node, visible) {
    if (visible) node.classList.remove('hidden');
    else node.classList.add('hidden');
  }

  function renderWeek() {
    var today = todayIso();
    var hasAny = Object.keys(state.entries).length > 0;
    setShown(el.weekEmpty, !hasAny);
    setShown(el.weekStats, hasAny);

    var fed = 0;
    var exercised = 0;
    var html = '';

    for (var i = WEEK_DAYS - 1; i >= 0; i--) {
      var iso = shiftIso(today, -i);
      var entry = state.entries[iso];
      var isToday = iso === today;

      if (entry) {
        if (entry.fed) fed++;
        if (entry.exercise) exercised++;
      }

      var day = isToday ? ' is-today' : '';
      var entry2 = entry || blankEntry();

      html += '<button type="button" class="week-day' + day + '" role="listitem" data-date="' + iso + '"' +
        ' aria-label="' + escapeHtml(labelFor(iso) + ', ' + (entry2.fed ? 'fed' : 'not fed') +
          (entry2.exercise ? ', exercised' : '')) + '">' +
        '<span class="week-day-name">' + escapeHtml(isToday ? 'Now' : weekdayFor(iso)) + '</span>' +
        '<span class="week-day-dots">';

      ['fed', 'water', 'exercise', 'wash'].forEach(function (key) {
        html += '<span class="week-dot week-dot-' + key + (entry2[key] ? ' is-on' : '') + '" aria-hidden="true"></span>';
      });

      html += '</span>' +
        '<span class="week-day-kcal">' + (entry2.calories !== '' ? escapeHtml(entry2.calories) : '&middot;') + '</span>' +
        '</button>';
    }

    el.weekStrip.innerHTML = html;
    el.statFed.textContent = String(fed);
    el.statExercise.textContent = String(exercised);

    var average = calorieAverage();
    el.statCalories.textContent = average === null ? '0' : String(average);
    el.statStreak.textContent = String(fedStreak());

    // Only nag about calories when the user gave us a target to compare with.
    var target = Number(state.profile.calorieTarget);
    if (average !== null && state.profile.calorieTarget !== '' && target > 0) {
      var diff = average - target;
      var percent = Math.round(Math.abs(diff) / target * 100);
      if (diff > 0) {
        setShown(el.warning, true);
        el.warning.textContent = 'Average of ' + average + ' kcal is about ' + percent +
          '% above the ' + target + ' kcal target. Treat this as a prompt to check with your vet, not a diagnosis.';
      } else {
        setShown(el.warning, true);
        el.warning.textContent = 'Average of ' + average + ' kcal is about ' + percent +
          '% below the ' + target + ' kcal target. A vet can confirm whether that suits your pet.';
      }
    } else {
      setShown(el.warning, false);
      el.warning.textContent = '';
    }
  }

  function announceSaved() {
    var ok = save(state);
    if (ok) {
      el.saveStatus.textContent = 'Saved';
      window.clearTimeout(announceSaved.timer);
      announceSaved.timer = window.setTimeout(function () { el.saveStatus.textContent = ''; }, 1600);
    } else {
      el.saveStatus.textContent = 'Could not save — this browser is blocking local storage.';
    }
  }

  function persist() {
    state.profile.name = el.petName.value.trim().slice(0, 40);
    state.profile.type = el.petType.value;
    state.profile.diet = el.petDiet.value.trim().slice(0, 80);
    state.profile.calorieTarget = numberOrBlank(el.petCalorieTarget.value, 0, 5000);

    collectDay();
    var ok = save(state);
    renderWeek();
    fillProfile();
    el.clearDay.disabled = !state.entries[activeDate];

    if (!ok) {
      el.storageNote.textContent = 'This browser is blocking local storage, so entries will disappear when you leave.';
      return;
    }
    el.saveStatus.textContent = 'Saved';
    window.clearTimeout(persist.timer);
    persist.timer = window.setTimeout(function () { el.saveStatus.textContent = ''; }, 1600);
  }

  function escapeHtml(value) {
    return window.PetGuide.escapeHtml(value);
  }

  // Exposed for scripts/check.js so the storage and date maths can be tested
  // without a browser. Declared above the DOM wiring so the whole pure-data
  // layer can be exercised on its own.
  window.PetTracker = {
    blankEntry: blankEntry,
    normalise: normalise,
    numberOrBlank: numberOrBlank,
    toIso: toIso,
    shiftIso: shiftIso,
    fedStreak: fedStreak
  };

  /* --------------------------------------------------------------- wiring */

  function populateTypes() {
    var types = window.PetData ? PetData.types() : [];
    types.forEach(function (type) {
      var option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      el.petType.appendChild(option);
    });
    if (!el.petType.options.length) {
      var fallback = document.createElement('option');
      fallback.value = '';
      fallback.textContent = 'Select a type';
      el.petType.insertBefore(fallback, el.petType.firstChild);
    }
  }

  function init() {
    if (!storageWorks) {
      el.storageNote.textContent = 'This browser is blocking local storage, so entries will disappear when you leave.';
    }

    populateTypes();
    fillProfile();
    fillDay(todayIso());
    renderWeek();

    [el.petName, el.petType, el.petDiet, el.petCalorieTarget].forEach(function (input) {
      input.addEventListener('input', persist);
      input.addEventListener('change', persist);
    });

    CHECK_KEYS.forEach(function (key) {
      if (boxes[key]) boxes[key].addEventListener('change', persist);
    });

    [el.calories, el.minutes, el.weight, el.weightUnit, el.notes].forEach(function (input) {
      input.addEventListener('input', persist);
      input.addEventListener('change', persist);
    });

    el.entryDate.addEventListener('change', function () {
      fillDay(el.entryDate.value);
      renderWeek();
    });

    el.weekStrip.addEventListener('click', function (event) {
      var button = event.target.closest('.week-day');
      if (!button) return;
      fillDay(button.getAttribute('data-date'));
      el.entryDate.focus();
    });

    el.clearDay.addEventListener('click', function () {
      delete state.entries[activeDate];
      save(state);
      fillDay(activeDate);
      renderWeek();
      el.saveStatus.textContent = 'Day cleared';
    });

    el.clearAll.addEventListener('click', function () {
      var first = window.confirm('Delete all tracker data, including every past day? This cannot be undone.');
      if (!first) return;
      state = blankState();
      erase();
      fillProfile();
      fillDay(activeDate);
      renderWeek();
      el.saveStatus.textContent = 'All tracker data deleted';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();