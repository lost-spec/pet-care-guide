
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

console.log('\n' + (bad ? bad + ' runtime checks FAILED' : 'all runtime checks passed'));
process.exit(bad ? 1 : 0);