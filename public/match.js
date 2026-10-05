(function () {
  'use strict';

  // The allowed values live here as well as on the server. The server is the
  // authority and rejects anything outside its list, but keeping a copy means
  // the form can refuse to submit an incomplete answer instead of paying for a
  // round trip that is only going to come back 400.
  var QUESTIONS = {
    home: ['flat', 'house-no-yard', 'house-yard', 'rural'],
    outdoor: ['none', 'balcony', 'small-yard', 'large-yard'],
    hoursAlone: ['0-2', '3-5', '6-8', '9plus'],
    activity: ['low', 'moderate', 'high'],
    experience: ['none', 'some', 'lots'],
    household: ['alone', 'adults', 'kids-young', 'kids-older', 'mixed', 'other-pets'],
    space: ['cramped', 'small', 'medium', 'large'],
    noiseTolerance: ['low', 'medium', 'high'],
    grooming: ['none', 'low', 'medium', 'high'],
    budget: ['tight', 'moderate', 'flexible'],
    time: ['hours-per-week', 'daily', 'most-days'],
    reason: ['companionship', 'calm-company', 'kids-bond', 'outdoor', 'interest', 'work']
  };

  var LABELS = {
    home: { flat: 'a flat or apartment', 'house-no-yard': 'a house with no yard', 'house-yard': 'a house with a yard', rural: 'a rural property' },
    outdoor: { none: 'no outdoor space at all', balcony: 'a balcony only', 'small-yard': 'a small yard or patio', 'large-yard': 'a large yard or open land' },
    hoursAlone: { '0-2': '0-2 hours alone on a typical weekday', '3-5': '3-5 hours alone', '6-8': '6-8 hours alone', '9plus': '9+ hours alone' },
    activity: { low: 'a calm, low-key household', moderate: 'a moderate amount of daily activity', high: 'an active, outdoorsy household' },
    experience: { none: 'no experience with this kind of pet', some: 'some experience', lots: 'a lot of experience' },
    household: { alone: 'living alone', adults: 'adults only', 'kids-young': 'young children under 6', 'kids-older': 'children 6 and over', mixed: 'a mix of adults and children', 'other-pets': 'other pets already at home' },
    space: { cramped: 'very little indoor space', small: 'a small home', medium: 'a medium home', large: 'a large home' },
    noiseTolerance: { low: 'low tolerance for noise', medium: 'moderate tolerance for noise', high: 'high tolerance for noise' },
    grooming: { none: 'no interest in grooming', low: 'minimal grooming', medium: 'regular grooming', high: 'happy to groom often' },
    budget: { tight: 'a tight budget', moderate: 'a moderate budget', flexible: 'a flexible budget' },
    time: { 'hours-per-week': 'a couple of hours a week', daily: 'some time every day', 'most-days': 'a good amount of time most days' },
    reason: { companionship: 'companionship', 'calm-company': 'calm, quiet company', 'kids-bond': 'a bond with children', outdoor: 'being outdoors and active', interest: 'a genuine interest or hobby', work: 'work, such as therapy or farm work' }
  };

  var NUMBERING = {
    home: 1, outdoor: 2, hoursAlone: 3, activity: 4, experience: 5, household: 6,
    space: 7, noiseTolerance: 8, grooming: 9, budget: 10, time: 11, reason: 12
  };

  var form = document.getElementById('match-form');
  var errorBox = document.getElementById('match-error');
  var results = document.getElementById('match-results');
  var list = document.getElementById('match-list');
  var headline = document.getElementById('match-headline');
  var runnerUpBox = document.getElementById('match-runner-up');
  var runnerUpText = document.getElementById('match-runner-up-text');
  var considerationsBox = document.getElementById('match-considerations');
  var considerationsList = document.getElementById('match-considerations-list');
  var vetNote = document.getElementById('match-vet-note');
  var errorCard = document.getElementById('match-error-card');
  var errorDetail = document.getElementById('match-error-detail');
  var retry = document.getElementById('match-retry');
  var submit = document.getElementById('match-submit');

  function setShown(el, shown) {
    if (!el) return;
    el.classList.toggle('hidden', !shown);
  }

  function selected(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : '';
  }

  // Keep a class on the chosen chip. The CSS can do this with :has(), but not
  // in every engine, and a form where a picked answer is invisible is worse
  // than useless.
  function markChoices() {
    var labels = form.querySelectorAll('.choice');
    for (var i = 0; i < labels.length; i++) {
      var input = labels[i].querySelector('input');
      labels[i].classList.toggle('is-selected', Boolean(input && input.checked));
    }
  }

  form.addEventListener('change', markChoices);

  // Returns the answers, or lists what is missing. Missing questions are
  // reported by number so the message is usable, since these are radio groups
  // spread down a long page.
  function collect() {
    var answers = {};
    var missing = [];
    Object.keys(QUESTIONS).forEach(function (key) {
      var value = selected(key);
      if (!value) {
        missing.push('Question ' + NUMBERING[key]);
        return;
      }
      if (QUESTIONS[key].indexOf(value) === -1) {
        missing.push('Question ' + NUMBERING[key]);
        return;
      }
      answers[key] = value;
    });
    return { answers: answers, missing: missing };
  }

  function rating(text) {
    if (text === 'low') return 'Low';
    if (text === 'high') return 'High';
    return 'Medium';
  }

  // The AI's text is written by a model, so it is inserted as text, never as
  // markup. buildCard assigns with textContent only.
  function buildCard(match, rank) {
    var card = document.createElement('article');
    card.className = 'match-card';

    var badge = document.createElement('p');
    badge.className = 'match-rank';
    badge.textContent = rank === 1 ? 'Best fit' : 'Also suits';
    card.appendChild(badge);

    var title = document.createElement('h3');
    title.className = 'match-card-title';
    // Species and breed are separate strings so neither can break the other's
    // styling, and both stay plain text.
    title.appendChild(document.createTextNode(match.breed));
    card.appendChild(title);

    var species = document.createElement('p');
    species.className = 'match-species';
    species.textContent = match.species;
    card.appendChild(species);

    if (match.why) {
      var why = document.createElement('p');
      why.className = 'match-body';
      why.textContent = match.why;
      card.appendChild(why);
    }

    var facts = document.createElement('dl');
    facts.className = 'match-facts';
    [
      ['Effort', match.effort],
      ['Ongoing cost', match.cost]
    ].forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = rating(pair[1]);
      facts.appendChild(dt);
      facts.appendChild(dd);
    });
    card.appendChild(facts);

    if (match.watchOut) {
      var warn = document.createElement('p');
      warn.className = 'match-watch-out';
      var label = document.createElement('strong');
      label.textContent = 'Before you commit: ';
      warn.appendChild(label);
      warn.appendChild(document.createTextNode(match.watchOut));
      card.appendChild(warn);
    }

    return card;
  }

  function render(data) {
    headline.textContent = data.headline || 'Your matches';

    list.textContent = '';
    data.matches.forEach(function (match, index) {
      list.appendChild(buildCard(match, index + 1));
    });

    setShown(runnerUpBox, Boolean(data.runnerUp));
    if (data.runnerUp) runnerUpText.textContent = data.runnerUp;

    considerationsList.textContent = '';
    var items = Array.isArray(data.considerations) ? data.considerations : [];
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      considerationsList.appendChild(li);
    });
    setShown(considerationsBox, items.length > 0);

    setShown(vetNote, Boolean(data.vetNote));
    if (data.vetNote) vetNote.textContent = data.vetNote;

    setShown(results, true);
    setShown(errorCard, false);
    setShown(errorBox, false);
    results.focus ? results.focus() : null;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showError(message) {
    setShown(errorBox, true);
    errorBox.textContent = message;
    setShown(results, false);
    errorBox.focus ? errorBox.focus() : null;
  }

  function showErrorCard(message) {
    errorDetail.textContent = message;
    setShown(errorCard, true);
    setShown(results, false);
    errorCard.focus ? errorCard.focus() : null;
  }

  function busy(on) {
    if (!submit) return;
    submit.disabled = on;
    submit.textContent = on ? 'Thinking…' : 'Show my matches';
    submit.classList.toggle('is-busy', on);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    markChoices();

    var result = collect();
    if (result.missing.length) {
      showError('Please answer ' + result.missing.join(', ') + ' before continuing.');
      return;
    }

    busy(true);
    setShown(errorBox, false);
    setShown(errorCard, false);

    // Returned so the runtime harness can await the render, exactly as a real
    // submit would. Event handlers may return anything; the browser ignores it.
    return fetch('/api/pet-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: result.answers })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result2) {
        busy(false);
        if (!result2.ok) {
          var code = result2.body && result2.body.code;
          showErrorCard(
            code === 'ai_not_configured'
              ? 'Match suggestions need the AI key on the server. Add LLM_API_KEY in your host settings to switch this on.'
              : (result2.body && result2.body.error) || 'Something went wrong. Please try again.'
          );
          return;
        }
        render(result2.body || {});
      })
      .catch(function () {
        busy(false);
        showErrorCard('Could not reach the server. Check your connection and try again.');
      });
  });

  if (retry) {
    retry.addEventListener('click', function () {
      setShown(errorCard, false);
      var first = form.querySelector('input[name="home"]');
      if (first) first.focus();
    });
  }

  markChoices();

  // Exported for the runtime harness. Not used by the page itself.
  window.MatchAdvisor = { QUESTIONS: QUESTIONS, LABELS: LABELS };
})();
