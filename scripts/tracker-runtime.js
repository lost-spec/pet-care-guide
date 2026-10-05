
// Runs public/tracker.js end to end against a small DOM stub so init()
// actually executes. scripts/check.js only covers the pure data layer, which
// would not have caught a startup throw such as calling a method
// pet-data.js does not have.
//
// Usage: node scripts/tracker-runtime.js
const fs = require('fs');
const vm = require('vm');

function makeDom() {
  const listeners = new Map();
  function el(id) {
    const node = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      type: '',
      disabled: false,
      children: [],
      classes: new Set(),
      attrs: {},
      classList: {
        add(c) { node.classes.add(c); },
        remove(c) { node.classes.delete(c); },
        contains(c) { return node.classes.has(c); },
        toggle(c, force) {
          const on = force === undefined ? !node.classes.has(c) : !!force;
          if (on) node.classes.add(c); else node.classes.delete(c);
          return on;
        }
      },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return k in node.attrs ? node.attrs[k] : null; },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener(type, fn) { listeners.set(id + ':' + type, fn); },
      closest() { return null; },
      querySelectorAll(sel) { return descendants(node).filter((c) => sel.indexOf('checkbox') !== -1 ? c.type === 'checkbox' : true); }
    };
    return node;
  }
  // A real querySelectorAll walks descendants, not just direct children. The
  // checkboxes live inside a <label> inside the fieldset.
  function descendants(node) {
    const out = [];
    (function walk(n) {
      (n.children || []).forEach((c) => { if (c) { out.push(c); walk(c); } });
    })(node);
    return out;
  }
  const nodes = new Map();
  const create = (tag) => el(tag);
  return {
    nodes,
    listeners,
    document: {
      readyState: 'complete',
      createElement(tag) { return create(tag); },
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, el(id));
        return nodes.get(id);
      },
      querySelectorAll(sel) {
        const box = nodes.get('checklist');
        if (!box) return [];
        const all = descendants(box);
        return sel.indexOf('checkbox') !== -1 ? all.filter((c) => c.type === 'checkbox') : all;
      },
      querySelector() { return null; },
      addEventListener() {}
    },
    fire(id, type) {
      const fn = listeners.get(id + ':' + type);
      if (!fn) throw new Error('no listener for ' + id + ':' + type);
      fn();
    }
  };
}

function load(store, pet) {
  const dom = makeDom();
  const ctx = {
    document: dom.document,
    window: {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; }
      },
      setTimeout: () => 0,
      clearTimeout: () => {},
      confirm: () => true
    },
    JSON, Math, Date, Number, String, Object, Array, isFinite, RegExp, console
  };
  ctx.window.PetGuide = { escapeHtml: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  vm.createContext(ctx);
  // The page ships this text in the HTML; the stub starts empty.
  dom.document.getElementById('hero-tagline').textContent = 'Set up around your pet\u2019s species, breed and age';
  vm.runInContext(fs.readFileSync('public/pet-data.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('public/tracker.js', 'utf8'), ctx);
  return { dom, ctx };
}

let bad = 0;
function check(label, cond, extra) {
  if (!cond) { bad++; console.log('FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
  else console.log('ok    ' + label);
}

const PET_KEY = 'petCareGuide.pet.v1';

// 1. No pet saved: gate shown, body hidden, nothing built.
{
  const { dom } = load({});
  check('gate: no pet means gate is visible', !dom.nodes.get('tracker-gate').classes.has('hidden'));
  check('gate: body stays hidden', dom.nodes.get('tracker-body').classes.has('hidden'));
  check('gate: no checklist built', dom.nodes.get('checklist').children.length === 0);
  check('gate: tagline untouched', dom.nodes.get('hero-tagline').textContent.indexOf('Set up around') === 0);
}

// 2. Dog saved: body shown, dog checklist, dog diet.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' }) };
  const { dom } = load(store);
  check('dog: gate hidden', dom.nodes.get('tracker-gate').classes.has('hidden'));
  check('dog: body shown', !dom.nodes.get('tracker-body').classes.has('hidden'));

  const chips = dom.document.querySelectorAll('input[type=checkbox]');
  check('dog: six checkboxes rendered', chips.length === 6, chips.length + ' built');
  check('dog: fed checkbox first', chips[0] && chips[0].id === 'chk-fed', chips[0] && chips[0].id);
  check('dog: walk checkbox present', chips.some((c) => c.id === 'chk-walk'));
  check('dog: type dropdown populated', dom.nodes.get('pet-type').children.length === 9,
    dom.nodes.get('pet-type').children.length + ' options');
  check('dog: type preselected', dom.nodes.get('pet-type').value === 'Dog', dom.nodes.get('pet-type').value);
  check('dog: breed carried over', dom.nodes.get('profile-summary').textContent.indexOf('Poodle') >= 0,
    dom.nodes.get('profile-summary').textContent);
  check('dog: diet note mentions treats', /treats/i.test(dom.nodes.get('diet-note').textContent),
    dom.nodes.get('diet-note').textContent);
  check('dog: minutes field visible', !dom.nodes.get('minutes-field').classes.has('hidden'));
  check('dog: exercised stat visible', !dom.nodes.get('stat-exercise-box').classes.has('hidden'));
  check('dog: tagline names the pet', /poodle/i.test(dom.nodes.get('hero-tagline').textContent),
    dom.nodes.get('hero-tagline').textContent);
}

// 3. Fish saved: no exercise anywhere, fish diet, aquarium routine.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Fish', breed: 'Betta', ageStage: 'Adult (1-5 years)' }) };
  const { dom } = load(store);
  const chips = dom.document.querySelectorAll('input[type=checkbox]');
  check('fish: six checkboxes rendered', chips.length === 6, chips.length + ' built');
  check('fish: no walk offered', chips.every((c) => c.id !== 'chk-walk'), chips.map((c) => c.id).join(','));
  check('fish: water change offered', chips.some((c) => c.id === 'chk-water'));
  check('fish: filter check offered', chips.some((c) => c.id === 'chk-filter'));
  check('fish: minutes field hidden', dom.nodes.get('minutes-field').classes.has('hidden'));
  check('fish: exercised stat hidden', dom.nodes.get('stat-exercise-box').classes.has('hidden'));
  check('fish: diet note mentions overfeeding',
    /overfeeding|fouled/i.test(dom.nodes.get('diet-note').textContent), dom.nodes.get('diet-note').textContent);
}

// 4. Rabbit senior: senior diet guidance.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Rabbit', breed: 'Holland Lop', ageStage: 'Senior (5 years and up)' }) };
  const { dom } = load(store);
  const note = dom.nodes.get('diet-note').textContent;
  check('rabbit senior: diet mentions hay', /hay/i.test(note), note);
  check('rabbit senior: diet mentions older pets', /older pets/i.test(note), note);
  const chips = dom.document.querySelectorAll('input[type=checkbox]');
  check('rabbit: hay is the food item', chips.some((c) => c.id === 'chk-hay'));
}

// 5. Ticking a chip persists, then survives a reload.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' }) };
  const first = load(store);
  const fed = first.dom.document.querySelectorAll('input[type=checkbox]').find((c) => c.id === 'chk-fed');
  fed.checked = true;
  first.dom.fire('checklist', 'change');
  check('tick: entry stored', !!(store['petCareGuide.tracker.v1'] &&
    JSON.parse(store['petCareGuide.tracker.v1']).entries[Object.keys(JSON.parse(store['petCareGuide.tracker.v1']).entries)[0]]),
    store['petCareGuide.tracker.v1']);
  check('tick: week strip rendered seven cells', (first.dom.nodes.get('week-strip').innerHTML.match(/week-cell/g) || []).length >= 7);
  check('tick: stats no longer hidden', !first.dom.nodes.get('week-stats').classes.has('hidden'));

  const second = load(store);
  const reloaded = second.dom.document.querySelectorAll('input[type=checkbox]').find((c) => c.id === 'chk-fed');
  check('tick: survives a reload', reloaded && reloaded.checked === true);
}

const TRACK_KEY = 'petCareGuide.tracker.v1';

// How many of the last 7 days have an entry, counted from the real rendered
// stats rather than a reimplementation, so a future refactor cannot quietly
// change the meaning without breaking here.
function recordedFrom(dom, id) { return Number(dom.nodes.get(id).textContent); }

// 6. A brand new log must not look like a week of neglect. One ticked day in
//    the window has to count as 1 recorded day, and the six days the owner
//    never opened have to be marked unrecorded rather than simply unticked.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' }) };
  const { dom } = load(store);
  const fed = dom.document.querySelectorAll('input[type=checkbox]').find((c) => c.id === 'chk-fed');
  fed.checked = true;
  dom.fire('checklist', 'change');

  check('coverage: one ticked day records 1 day',
    dom.nodes.get('stat-logged').textContent === '1', dom.nodes.get('stat-logged').textContent);
  check('coverage: days fed is 1, not 0',
    dom.nodes.get('stat-fed').textContent === '1', dom.nodes.get('stat-fed').textContent);
  check('coverage: note explains a blank day',
    /not recorded/i.test(dom.nodes.get('week-note').textContent), dom.nodes.get('week-note').textContent);

  const html = dom.nodes.get('week-strip').innerHTML;
  const cells = html.match(/class="week-cell[^"]*"/g) || [];
  check('coverage: all seven days shown', cells.length === 7, cells.length + ' cells');
  check('coverage: six days marked unrecorded',
    (html.match(/week-cell-unrecorded/g) || []).length === 6,
    (html.match(/week-cell-unrecorded/g) || []).length + ' unrecorded');
  check('coverage: the ticked day is not marked unrecorded',
    cells.filter((c) => /week-cell-unrecorded/.test(c)).length === 6);
  check('coverage: blank days say nothing recorded',
    /nothing recorded/.test(html) && !/nothing logged/.test(html));
}

// 7. The review payload has to carry how much of the window was actually
//    recorded, or the model reads a logging gap as missed care.
{
  const store = { [PET_KEY]: JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' }) };
  const { dom, ctx } = load(store);
  dom.document.querySelectorAll('input[type=checkbox]').find((c) => c.id === 'chk-fed').checked = true;
  dom.fire('checklist', 'change');

  const seen = [];
  ctx.fetch = (url, opts) => {
    seen.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      verdict: 'good', headline: 'ok', positives: ['x'], concerns: [], tips: ['y'], vetNote: '' }) });
  };
  ctx.window.fetch = ctx.fetch;
  dom.fire('review-btn', 'click');

  check('review: request sent', seen.length === 1, seen.length + ' requests');
  const week = seen[0] && seen[0].week;
  check('review: payload carries trackedDays', week && week.trackedDays === 1,
    week && JSON.stringify(week));
  check('review: payload carries fedDays', week && week.fedDays === 1,
    week && JSON.stringify(week));
}

// 8. trackedDays has to count days, not just today's entry, and it must not
//    exceed the 7 day window however much history has piled up.
{
  function isoBack(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
  const entries = {};
  for (let i = 0; i < 3; i++) entries[isoBack(i)] = { fed: true };
  for (let i = 3; i < 20; i++) entries[isoBack(i)] = { fed: true };

  const store = {
    [PET_KEY]: JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' }),
    [TRACK_KEY]: JSON.stringify({
      version: 1,
      profile: { petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)', diet: '', calorieTarget: '' },
      entries
    })
  };
  const { dom, ctx } = load(store);

  check('window: recorded days capped at 7', recordedFrom(dom, 'stat-logged') === 7,
    recordedFrom(dom, 'stat-logged') + ' recorded');
  check('window: days fed capped at 7', recordedFrom(dom, 'stat-fed') === 7,
    recordedFrom(dom, 'stat-fed') + ' fed');
  check('window: no cell is unrecorded when the week is full',
    (dom.nodes.get('week-strip').innerHTML.match(/week-cell-unrecorded/g) || []).length === 0,
    (dom.nodes.get('week-strip').innerHTML.match(/week-cell-unrecorded/g) || []).length + ' unrecorded');
  check('window: note says 7 of 7', /^7 of the last 7 days/.test(dom.nodes.get('week-note').textContent),
    dom.nodes.get('week-note').textContent);

  // Only three of those days are inside the window that the payload reports.
  const seen = [];
  ctx.fetch = (url, opts) => {
    seen.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      verdict: 'good', headline: 'ok', positives: ['x'], concerns: [], tips: ['y'], vetNote: '' }) });
  };
  ctx.window.fetch = ctx.fetch;
  dom.fire('review-btn', 'click');
  const week = seen[0] && seen[0].week;
  check('window: payload agrees the window holds 7 recorded days',
    week && week.trackedDays === 7, week && JSON.stringify(week));
  check('window: payload never exceeds the window',
    week && week.trackedDays <= 7 && week.fedDays <= 7, week && JSON.stringify(week));
}

// -------------------------------------------------------------- match page
// The question list is read from the page rather than hardcoded here, so this
// stub cannot fall out of step with what match.js actually asks for.
const MATCH_PAGE = fs.readFileSync('public/match.html', 'utf8');
const MATCH_FORM_HTML = MATCH_PAGE.match(/id="match-form"[\s\S]*?<\/form>/)[0];

// The real option values, in document order, grouped by question. match.js
// validates every answer against its own allowed list, so a stub that invents
// values like "a"/"b" would make every answer look missing. The harness has to
// feed the same strings the page would submit.
const MATCH_OPTIONS = (() => {
  const options = {};
  const inputs = MATCH_FORM_HTML.match(/<input[^>]*>/g) || [];
  inputs.forEach((tag) => {
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    const value = (tag.match(/value="([^"]+)"/) || [])[1];
    if (!name || value === undefined) return;
    (options[name] = options[name] || []).push(value);
  });
  return options;
})();

const MATCH_KEYS = Object.keys(MATCH_OPTIONS);

// The elements match.js toggles start out hidden in the markup. Seed those
// classes so "was this revealed?" checks are meaningful instead of passing
// just because nothing was ever marked hidden.
const MATCH_INITIAL_CLASSES = (() => {
  const classes = {};
  const tags = MATCH_PAGE.match(/<(?:div|section|p|button)[^>]*id="match-[^"]*"[^>]*>/g) || [];
  tags.forEach((tag) => {
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    const classAttr = (tag.match(/class="([^"]*)"/) || [])[1] || '';
    classes[id] = classAttr.split(/\s+/).filter(Boolean);
  });
  return classes;
})();

// public/match.js is a separate entry point with its own element ids, so it
// needs its own stub. The DOM here is closer to a real one: it has to support
// querySelector on name="x" and :checked, plus createElement returning nodes
// that record what was assigned to them, because the whole point is to prove
// the AI's text is written as text.
function makeMatchDom() {
  const listeners = new Map();
  const nodes = new Map();

  // matching is declared below and used by both the node querySelector and the
  // document one, so both see the same rules.
  function el(id) {
    const node = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      tag: id,
      type: '',
      name: '',
      checked: false,
      disabled: false,
      children: [],
      classes: new Set(),
      classList: {
        add(c) { node.classes.add(c); },
        remove(c) { node.classes.delete(c); },
        contains(c) { return node.classes.has(c); },
        toggle(c, force) {
          const on = force === undefined ? !node.classes.has(c) : !!force;
          if (on) node.classes.add(c); else node.classes.delete(c);
          return on;
        }
      },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener(type, fn) { listeners.set(id + ':' + type, fn); },
      // Each node searches its own subtree, which is how a browser behaves.
      querySelector(sel) { return all(node, sel)[0] || null; },
      querySelectorAll(sel) { return all(node, sel); },
      focus() {},
      scrollIntoView() {}
    };

    // Assigning textContent replaces the node's children in a real DOM, and
    // match.js relies on that to clear a list before refilling it. A plain
    // property would silently keep the old children, so a resubmit would look
    // like it had stacked two sets of results.
    Object.defineProperty(node, 'textContent', {
      get() { return node.text; },
      set(value) { node.text = value === undefined || value === null ? '' : String(value); node.children = []; },
      enumerable: true
    });

    return node;
  }

  function all(node, sel, out = []) {
    (node.children || []).forEach((c) => {
      if (!c) return;
      if (matching(c, sel)) out.push(c);
      all(c, sel, out);
    });
    return out;
  }

  const dom = {
    nodes,
    listeners,
    fire(id, type) {
      const fn = listeners.get(id + ':' + type);
      if (!fn) throw new Error('no listener for ' + id + ':' + type);
      return fn({ preventDefault() {} });
    },
    seed(id, patch) { Object.assign(el(id), patch); return nodes.get(id); },
    store(id, node) { nodes.set(id, node); return node; },
    document: {
      readyState: 'complete',
      createElement(tag) { return el(tag); },
      createTextNode(text) { return { textNode: true, textContent: String(text), children: [] }; },
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, el(id));
        return nodes.get(id);
      },
      addEventListener() {}
    }
  };

  // Rebuild the form as a real tree: one fieldset per question, with labels
  // wrapping inputs that carry the page's own name/value pairs.
  const form = el('match-form');
  MATCH_KEYS.forEach((key) => {
    const fieldset = el('fieldset');
    MATCH_OPTIONS[key].forEach((value, i) => {
      const label = el('label');
      label.className = 'choice';
      const input = el('input');
      input.type = 'input';
      input.name = key;
      input.value = value;
      input.checked = false;
      input.id = key + '-' + i;
      label.appendChild(input);
      fieldset.children.push(label);
    });
    form.children.push(fieldset);
  });
  nodes.set('match-form', form);
  dom.formNode = form;

  ['match-error', 'match-results', 'match-list', 'match-headline', 'match-runner-up',
    'match-runner-up-text', 'match-considerations', 'match-considerations-list',
    'match-vet-note', 'match-error-card', 'match-error-detail', 'match-retry',
    'match-submit'].forEach((id) => {
    const node = el(id);
    (MATCH_INITIAL_CLASSES[id] || []).forEach((c) => node.classes.add(c));
    nodes.set(id, node);
  });

  return dom;
}

function loadMatch(dom) {
  const ctx = {
    document: dom.document,
    window: { setTimeout: () => 0, clearTimeout: () => {}, confirm: () => true },
    JSON, Math, Date, Number, String, Object, Array, isFinite, RegExp, Boolean, console
  };
  ctx.window.document = dom.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('public/match.js', 'utf8'), ctx);
  return ctx;
}

// Answer a question through the same selector the page uses, so the harness
// cannot accidentally tick something the page could not see.
// :checked has to reflect current state, so it is evaluated at query time
// rather than stored. A real browser does the same thing.
function matching(node, sel) {
  const attr = sel.match(/\[name="([^"]+)"\]/);
  const needsChecked = sel.indexOf(':checked') !== -1;
  if (sel.indexOf('input') === 0 && node.type !== 'input') return false;
  if (sel.indexOf('label') === 0 && node.tag !== 'label') return false;
  // className and classList are two ways of setting the same thing in the DOM,
  // so a selector has to accept either.
  const wantsClass = sel.slice(1);
  if (sel.indexOf('.') === 0
    && !node.classes.has(wantsClass) && String(node.className).split(/\s+/).indexOf(wantsClass) === -1) {
    return false;
  }
  if (attr && node.name !== attr[1]) return false;
  if (needsChecked && !node.checked) return false;
  return true;
}

function answer(dom, key, valueIndex = 0) {
  const inputs = dom.formNode.querySelectorAll('input[name="' + key + '"]');
  if (!inputs.length) return null;
  inputs.forEach((input) => { input.checked = false; });
  inputs[valueIndex].checked = true;
  return inputs[valueIndex];
}

function pickAll(dom) { MATCH_KEYS.forEach((key) => answer(dom, key)); }

// 9 to 14. match.js renders after its fetch resolves, so these cases have to
// await the promise the submit handler returns. A synchronous assertion here
// would test the spinner, not the page.
async function matchTests() {

// 9. An unanswered question must be refused before any request is made.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  let called = 0;
  ctx.fetch = () => { called++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
  ctx.window.fetch = ctx.fetch;

  await dom.fire('match-form', 'submit');
  check('match: an empty form does not call the server', called === 0, called + ' requests');
  check('match: the empty form explains what is missing',
    !dom.nodes.get('match-error').classes.has('hidden'),
    dom.nodes.get('match-error').textContent);
  check('match: it names question 1', /Question 1/.test(dom.nodes.get('match-error').textContent),
    dom.nodes.get('match-error').textContent);
}

// 10. A partially answered form names the specific missing question, not all of them.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  ctx.window.fetch = ctx.fetch;

  ['home', 'outdoor', 'hoursAlone', 'activity', 'experience', 'household', 'space']
    .forEach((key) => answer(dom, key));
  await dom.fire('match-form', 'submit');

  const msg = dom.nodes.get('match-error').textContent;
  check('match: only the unanswered questions are named', /Question 8/.test(msg) && !/Question 1\b/.test(msg), msg);
}

// 11. A complete form sends every answer, and the chosen chips are visible.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  const sent = [];
  ctx.fetch = (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      headline: 'A calm indoor cat would suit you best.',
      matches: [{ species: 'Cat', breed: 'Domestic Shorthair', why: 'Quiet and self-sufficient.',
        effort: 'low', cost: 'medium', watchOut: 'They still need daily company.' }],
      runnerUp: 'A rabbit would work if you want a companion nearby.',
      considerations: ['Pets are a 10 to 30 year commitment.', 'Adopt from a shelter where you can.'],
      vetNote: 'Ask the shelter about vaccinations.'
    }) });
  };
  ctx.window.fetch = ctx.fetch;

  // Deliberately not the first option everywhere, so a harness that ignored the
  // tick and read option 0 by default would be caught.
  MATCH_KEYS.forEach((key, i) => answer(dom, key, i % 2));
  await dom.fire('match-form', 'submit');

  check('match: a complete form calls the server', sent.length === 1, sent.length + ' requests');
  const answers = sent[0] && sent[0].answers;
  check('match: every answer is sent', answers && Object.keys(answers).length === 12,
    answers ? Object.keys(answers).length + ' answers' : 'none');
  const sentValues = MATCH_KEYS.map((k) => answers && answers[k]);
  const expected = MATCH_KEYS.map((k, i) => MATCH_OPTIONS[k][i % 2]);
  check('match: answers are the chosen values, not the first option',
    sentValues.join('|') === expected.join('|'), sentValues.join(','));
  // Only the chosen chip in each group carries is-selected; an unchecked one
  // carrying it would tell the user they picked something they did not.
  const chosen = dom.formNode.querySelectorAll('label')
    .filter((label) => {
      const input = label.querySelector('input');
      return input && input.checked;
    });
  const highlighted = dom.formNode.querySelectorAll('label')
    .filter((label) => label.classes.has('is-selected'));
  check('match: exactly the chosen chips are highlighted',
    chosen.length === 12 && highlighted.length === 12,
    chosen.length + ' chosen, ' + highlighted.length + ' highlighted');

  check('match: results are revealed', !dom.nodes.get('match-results').classes.has('hidden'));
  check('match: the headline is set', /cat/i.test(dom.nodes.get('match-headline').textContent),
    dom.nodes.get('match-headline').textContent);
  check('match: one card per match', dom.nodes.get('match-list').children.length === 1,
    dom.nodes.get('match-list').children.length + ' cards');
  check('match: the runner up is shown', !dom.nodes.get('match-runner-up').classes.has('hidden'));
  check('match: considerations are listed',
    dom.nodes.get('match-considerations-list').children.length === 2,
    dom.nodes.get('match-considerations-list').children.length + ' points');
  check('match: the vet note is shown', !dom.nodes.get('match-vet-note').classes.has('hidden'));
  check('match: the error box is hidden on success',
    dom.nodes.get('match-error').classes.has('hidden'));
  check('match: the busy label is restored', dom.nodes.get('match-submit').textContent === 'Show my matches',
    dom.nodes.get('match-submit').textContent);
}

// 12. A hostile reply must not be able to inject markup.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    headline: '<img src=x onerror=alert(1)>',
    matches: [{ species: 'Cat', breed: '<script>alert(2)</script>', why: '<b>bold</b>',
      effort: 'low', cost: 'low', watchOut: '<i>watch</i>' }],
    considerations: ['<script>alert(3)</script>']
  }) });
  ctx.window.fetch = ctx.fetch;

  pickAll(dom);
  await dom.fire('match-form', 'submit');

  const html = dom.nodes.get('match-list').innerHTML;
  check('match: injected markup is not written as HTML',
    html === '' && !/<script>/.test(html), JSON.stringify(html));
  check('match: the injected script is kept as plain text',
    dom.nodes.get('match-headline').textContent.indexOf('<img') === 0,
    dom.nodes.get('match-headline').textContent);
  check('match: consideration markup is not rendered',
    dom.nodes.get('match-considerations-list').children[0].innerHTML === '',
    JSON.stringify(dom.nodes.get('match-considerations-list').children[0].innerHTML));
}

// 13. Submitting twice must replace the results, not stack them up.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    headline: 'first', matches: [{ species: 'Cat', breed: 'A', why: 'x', effort: 'low', cost: 'low', watchOut: 'y' }],
    considerations: ['one']
  }) });
  ctx.window.fetch = ctx.fetch;

  pickAll(dom);
  await dom.fire('match-form', 'submit');
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    headline: 'second', matches: [{ species: 'Dog', breed: 'B', why: 'x', effort: 'high', cost: 'high', watchOut: 'y' }],
    considerations: ['two', 'three']
  }) });
  ctx.window.fetch = ctx.fetch;
  await dom.fire('match-form', 'submit');

  check('match: resubmitting replaces the cards',
    dom.nodes.get('match-list').children.length === 1,
    dom.nodes.get('match-list').children.length + ' cards');
  check('match: resubmitting replaces the considerations',
    dom.nodes.get('match-considerations-list').children.length === 2,
    dom.nodes.get('match-considerations-list').children.length + ' points');
  check('match: resubmitting replaces the headline',
    dom.nodes.get('match-headline').textContent === 'second',
    dom.nodes.get('match-headline').textContent);
}

// 14. A missing AI key must say so rather than look like a broken page.
{
  const dom = makeMatchDom();
  const ctx = loadMatch(dom);
  ctx.fetch = () => Promise.resolve({
    ok: false, status: 503,
    json: () => Promise.resolve({ error: 'no key', code: 'ai_not_configured' })
  });
  ctx.window.fetch = ctx.fetch;

  pickAll(dom);
  await dom.fire('match-form', 'submit');

  check('match: a missing key shows an error card',
    !dom.nodes.get('match-error-card').classes.has('hidden'));
  check('match: the message names the environment variable',
    /LLM_API_KEY/.test(dom.nodes.get('match-error-detail').textContent),
    dom.nodes.get('match-error-detail').textContent);
  check('match: no results are shown on failure',
    dom.nodes.get('match-results').classes.has('hidden'));
  check('match: the submit button is usable again',
    dom.nodes.get('match-submit').disabled === false);
}

}

matchTests().then(function () {
  console.log('\n' + (bad ? bad + ' runtime checks FAILED' : 'all runtime checks passed'));
  process.exit(bad ? 1 : 0);
}, function (err) {
  console.log('FAIL  match harness threw -> ' + (err && err.message));
  console.log('\n' + (bad + 1) + ' runtime checks FAILED');
  process.exit(1);
});