#!/usr/bin/env node
/**
 * check.js — dependency-free checks for the parts that can be verified
 * without a browser or live API keys.
 *
 *   1. Every element script.js reaches for must exist in index.html.
 *   2. Every aria-describedby / aria-controls / label[for] must resolve.
 *   3. Form validation must accept real breed names and reject junk.
 *   4. pet-data.js must produce sane options for all nine pet types.
 *   5. The server's input validation and weight handling must behave.
 *
 * Run with: npm run check
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.error('FAIL  ' + label + (detail ? '\n        ' + detail : ''));
}

function section(name) {
  console.log('\n' + name);
}

/** Pull a top-level `function name(...) { ... }` block out of source text. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('could not find function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

const html = read('public/index.html');
const script = read('public/script.js');
const server = read('server.js');

/* ------------------------------------------------- 1. DOM id references */
section('Parse check');
// Parse every shipped script as a whole file. Without this, a stray brace
// survives because the logic checks below only extract single functions.
['server.js', 'public/script.js', 'public/ui.js', 'public/pet-data.js',
  'public/sources.js', 'public/birds.js', 'scripts/generate-breed-pages.js'].forEach((file) => {
  try {
    new vm.Script(read(file), { filename: file });
    ok(file + ' parses', true);
  } catch (error) {
    ok(file + ' parses: ' + error.message, false);
  }
});

section('DOM references');
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// Created at runtime by script.js, so it cannot appear in the static markup.
const RUNTIME_IDS = new Set(['sources-retry-btn']);

const referenced = new Set([...script.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
referenced.forEach((id) =>
  ok('script.js references missing #' + id, htmlIds.has(id) || RUNTIME_IDS.has(id)));

['pet-form', 'pet-type', 'breed', 'breed-list', 'breed-label', 'age-stage', 'weight',
  'weight-unit', 'location', 'submit-btn', 'form-error', 'results', 'results-heading',
  'results-loading', 'results-body', 'warnings', 'hazards', 'warnings-list', 'summary',
  'sources-section', 'sources-location-prompt', 'sources-location', 'sources-location-btn',
  'sources-loading', 'sources-error', 'sources-empty', 'sources-grid', 'error-state',
  'error-message', 'retry-btn'].forEach((id) => ok('required element #' + id, htmlIds.has(id)));

const feedTargets = ['feeding-keypoints', 'feeding-details', 'environment-keypoints',
  'environment-details', 'feeding-title', 'environment-title'];
feedTargets.forEach((id) => ok('results element #' + id, htmlIds.has(id)));

/* ------------------------------------------- 2. accessibility references */
section('Accessibility wiring');
[...html.matchAll(/aria-describedby="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .forEach((id) => ok('aria-describedby -> #' + id, htmlIds.has(id)));

[...html.matchAll(/aria-controls="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .forEach((id) => ok('aria-controls -> #' + id, htmlIds.has(id)));

[...html.matchAll(/aria-labelledby="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .forEach((id) => ok('aria-labelledby -> #' + id, htmlIds.has(id)));

[...html.matchAll(/<label for="([^"]+)"/g)]
  .forEach((m) => ok('label[for] -> #' + m[1], htmlIds.has(m[1])));

// Every input and select needs an accessible name.
[...html.matchAll(/<(input|select)\b[^>]*>/g)].forEach((tag) => {
  const type = (tag[0].match(/\btype="([^"]+)"/) || [])[1];
  if (type === 'hidden') return;
  const id = (tag[0].match(/\bid="([^"]+)"/) || [])[1];
  const named = id && html.includes('<label for="' + id + '"');
  const aria = /aria-label(?:ledby)?="/.test(tag[0]);
  ok('accessible name for ' + tag[0].slice(0, 60), named || aria);
});

// Disclosure buttons must describe what they expand.
[...html.matchAll(/<button[^>]*class="btn-read-more"[^>]*>/g)].forEach((tag) => {
  ok('read-more has aria-expanded', /aria-expanded="(true|false)"/.test(tag[0]), tag[0]);
  ok('read-more has aria-controls', /aria-controls="/.test(tag[0]), tag[0]);
  ok('read-more label says it expands',
    /Read more about/.test(html.slice(html.indexOf(tag[0]), html.indexOf(tag[0]) + 400)), tag[0]);
});

ok('results region is aria-live', /id="results-body"[^>]*aria-live="polite"/.test(html));
ok('decorative emoji are aria-hidden',
  !/<span class="pill"[^>]*>(?!<span aria-hidden)/.test(html));
ok('Guinea Pig uses a distinct emoji', /Guinea Pig<\/option>/.test(html));
ok('dog emoji present', /Dog<\/option>/.test(html));
ok('hamster emoji appears once', (html.match(/🐹/g) || []).length === 1);

/* ------------------------------------------------------ 3. breed checks */
section('Breed validation');
const sandbox = { window: {}, document: undefined };
vm.createContext(sandbox);
vm.runInContext(extractFunction(script, 'looksLikeGibberish') + '\nthis.g = looksLikeGibberish;', sandbox);
const gibberish = sandbox.g;

const realBreeds = ['Labrador Retriever', 'Golden Retriever', 'German Shepherd', 'French Bulldog',
  'Poodle', 'Beagle', 'Bulldog', 'Australian Shepherd', 'Border Collie', 'Corgi', 'Husky',
  'Chihuahua', 'Domestic Shorthair', 'Maine Coon', 'Siamese', 'Persian', 'Ragdoll', 'Bengal',
  'British Shorthair', 'Sphynx', 'Russian Blue', 'Abyssinian', 'Holland Lop', 'Mini Rex',
  'Mini Lop', 'Netherland Dwarf', 'Lionhead', 'Flemish Giant', 'Syrian Hamster', 'Roborovski',
  'Betta', 'Goldfish', 'Guppy', 'Neon Tetra', 'Angelfish', 'Molly', 'Platy', 'Koi',
  'Bearded Dragon', 'Leopard Gecko', 'Crested Gecko', 'Corn Snake', 'Ball Python',
  'Budgerigar', 'Cockatiel', 'African Grey Parrot', 'Lovebird', 'Canary', 'Macaw', 'Conure',
  'Quarter Horse', 'Thoroughbred', 'Morgan', 'Arabian', 'Appaloosa', 'Paint Horse', 'Mixed / Not sure'];
realBreeds.forEach((breed) => ok('accepts real breed "' + breed + '"', !gibberish(breed)));

const junk = ['asdfghjkl', 'qwertyuiop', 'aaaaaaa', '12345', 'xzcvbnm', 'aeiouaeiou', 'zzzzzz',
  'poiuytrewq', 'hjklhgfds', 'lkjhgfdsa', 'wsxedcrfv', 'qazwsxedc'];
junk.forEach((value) => ok('rejects junk "' + value + '"', gibberish(value)));

ok('breed max length is 60', /maxlength="60"/.test(html));
ok('breed input described by its error element',
  /id="breed"[\s\S]*?aria-describedby="breed-hint breed-error"/.test(html));
ok('breed input starts aria-invalid=false', /id="breed"[\s\S]*?aria-invalid="false"/.test(html));
ok('breed error element has role=alert', /id="breed-error"[^>]*role="alert"/.test(html));

/* ---------------------------------------------------------- 4. pet data */
section('Pet data');
const petSandbox = { window: {} };
vm.createContext(petSandbox);
vm.runInContext(read('public/pet-data.js'), petSandbox);
const PetData = petSandbox.window.PetData;

const TYPES = ['Dog', 'Cat', 'Rabbit', 'Hamster', 'Guinea Pig', 'Bird', 'Fish', 'Reptile', 'Horse'];
TYPES.forEach((type) => {
  const stages = PetData.stages(type);
  ok(type + ' has life stages', stages.length >= 3, JSON.stringify(stages));
  stages.forEach((s) => ok(type + ' stage is server-safe: "' + s + '"', /^[A-Za-z0-9\s.,()'-]{1,60}$/.test(s)));
  const breeds = PetData.breeds(type);
  ok(type + ' has breed suggestions', breeds.length >= 3);
  ok(type + ' offers Mixed / Not sure', breeds.indexOf(PetData.MIXED) > -1);
  const hazards = PetData.hazards(type);
  ok(type + ' has baseline hazards', hazards.length >= 3, 'got ' + hazards.length);
  hazards.forEach((h) => {
    ok(type + ' hazard has label + value', !!(h.label && h.value));
    ok(type + ' hazard label is short', h.label.length <= 24, h.label);
  });
});

['Dog', 'Cat', 'Rabbit', 'Horse', 'Hamster', 'Guinea Pig'].forEach((type) =>
  ok(type + ' uses the noun "Breed"', PetData.noun(type) === 'Breed'));
['Fish', 'Reptile', 'Bird'].forEach((type) =>
  ok(type + ' uses the noun "Species"', PetData.noun(type) === 'Species'));

ok('unknown type falls back to default stages', PetData.stages('Dragon').length === 3);
ok('placeholder mentions a species example', /Betta/.test(PetData.placeholder('Fish')));
ok('placeholder mentions a breed example', /Labrador/.test(PetData.placeholder('Dog')));
ok('stages are per-type, not shared',
  PetData.stages('Dog')[0] !== PetData.stages('Cat')[0]);
ok('kitten stage is cat-specific', PetData.stages('Cat')[0].indexOf('Kitten') === 0);
ok('foal stage is horse-specific', PetData.stages('Horse')[0].indexOf('Foal') === 0);

/* ------------------------------------------------------ 5. server logic */
section('Server validation');
const serverStart = server.indexOf('const NAME_REGEX');
const serverEnd = server.indexOf('async function callAI');
ok('server exposes validation helpers', serverStart > -1 && serverEnd > serverStart);

const serverSandbox = { module: {}, exports: {}, console };
vm.createContext(serverSandbox);
vm.runInContext(
  server.slice(serverStart, serverEnd) +
  '\nthis.validateInput = validateInput; this.toKg = toKg; this.buildContextLine = buildContextLine;',
  serverSandbox
);
const { validateInput, toKg, buildContextLine } = serverSandbox;

ok('rejects missing breed', validateInput('Dog', '') === 'Both petType and breed are required');
ok('rejects digits in breed', !!validateInput('Dog', 'R2D2'));
ok('rejects over-long breed', !!validateInput('Dog', 'a'.repeat(51)));
ok('accepts a plain breed', validateInput('Dog', 'Poodle') === null);
ok('rejects negative weight', !!validateInput('Dog', 'Poodle', { weight: '-4' }));
ok('rejects zero weight', !!validateInput('Dog', 'Poodle', { weight: '0' }));
ok('rejects absurd weight', !!validateInput('Dog', 'Poodle', { weight: '9999' }));
ok('rejects unknown unit', !!validateInput('Dog', 'Poodle', { weight: '10', weightUnit: 'stone' }));
ok('rejects injected life stage', !!validateInput('Dog', 'Poodle', { ageStage: '<script>' }));
ok('accepts full context',
  validateInput('Dog', 'Poodle', { ageStage: 'Puppy (under 1 year)', weight: '12', weightUnit: 'kg' }) === null);
ok('empty optional fields are fine',
  validateInput('Dog', 'Poodle', { ageStage: '', weight: '', weightUnit: '' }) === null);

/* -------------------------------------- 5b. suggestions survive the server */
// Any value the datalist can offer must pass server validation, or picking it
// from the list produces a 400 the user cannot act on.
TYPES.forEach((type) => {
  PetData.breeds(type).forEach((suggestion) => {
    ok(type + ' suggestion "' + suggestion + '" is accepted by the server',
      validateInput(type, suggestion) === null,
      validateInput(type, suggestion) || '');
  });
  PetData.stages(type).forEach((stage) => {
    ok(type + ' stage "' + stage + '" is accepted by the server',
      validateInput(type, 'Test Breed', { ageStage: stage }) === null,
      validateInput(type, 'Test Breed', { ageStage: stage }) || '');
  });
});
ok('"Mixed / Not sure" is accepted', validateInput('Dog', 'Mixed / Not sure') === null);
ok('a path-like value is still rejected', !!validateInput('Dog', '../../etc/passwd'));

ok('lb converts to kg', Math.abs(toKg(10, 'lb') - 4.54) < 0.01, String(toKg(10, 'lb')));
ok('kg passes through', toKg(12, 'kg') === 12);
ok('missing weight is null', toKg('', 'kg') === null);

const line = buildContextLine({ petType: 'Dog', breed: 'Poodle', ageStage: 'Puppy (under 1 year)', weight: '12', weightUnit: 'kg' });
ok('context line carries all fields',
  /Pet type: Dog/.test(line) && /Breed: Poodle/.test(line) &&
  /Life stage: Puppy/.test(line) && /Weight: 12 kg/.test(line), line);
const lbLine = buildContextLine({ petType: 'Dog', breed: 'Poodle', weight: '10', weightUnit: 'lb' });
ok('context line converts lb', /10 lb/.test(lbLine) && /4\.54 kg/.test(lbLine), lbLine);
const bareLine = buildContextLine({ petType: 'Cat', breed: 'Bengal' });
ok('context line works without optionals', bareLine === 'Pet type: Cat, Breed: Bengal', bareLine);

/* ------------------------------------------------------- 6. prompt rules */
section('Prompt contract');
ok('prompt asks for hazards', /"hazards"/.test(server));
ok('prompt forbids invented hazards', /never invent a hazard/i.test(server));
ok('prompt forbids dosing advice', /keep away from.*dosing advice/is.test(server));
ok('prompt asks for relative portions without weight', /relative/i.test(server));
ok('prompt defers medical questions to a vet', /consulting a vet/i.test(server));
ok('server tags shelters', /type: 'shelter'/.test(server));
ok('shelter lookup cannot break seller results', /degrades quietly/i.test(server));
ok('rate limits surface as 429', /429/.test(server));
ok('endpoints unchanged', /app\.post\('\/api\/pet-info'/.test(server) && /app\.post\('\/api\/pet-sources'/.test(server));

/* ---------------------------------------------------------- 7. SEO tags */
section('SEO');
['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'twitter:title',
  'twitter:image'].forEach((tag) => ok('has ' + tag, html.includes('"' + tag + '"')));
ok('has canonical', /rel="canonical"/.test(html));
ok('has favicon', /rel="icon"/.test(html));
ok('favicon file exists', fs.existsSync(path.join(ROOT, 'public', 'favicon.svg')));
ok('og image file exists', fs.existsSync(path.join(ROOT, 'public', 'og-image.svg')));
ok('has viewport', /name="viewport"/.test(html));
ok('html has lang', /<html lang="en">/.test(html));

/* ------------------------------------------------------- 8. sources page */
section('Sources page');
const sourcesHtml = read('public/sources.html');
const sourcesJs = read('public/sources.js');

ok('sources page does not load the care-form script',
  !/<script src="script\.js"/.test(sourcesHtml));
ok('sources page loads its own module', /<script src="sources\.js"/.test(sourcesHtml));
ok('care form script no-ops without a form', /if \(!form\) return;/.test(script));
ok('sources page sorts shelters first', /type === 'shelter' \? 0 : 1/.test(sourcesJs));
ok('sources page carries the buyer warning', /trader-warning/.test(sourcesHtml));
ok('sources page has shelter filter', /value="shelter"/.test(sourcesHtml));
ok('sources page announces results', /id="sources-grid"[^>]*aria-live="polite"/.test(sourcesHtml));
ok('sources page has canonical', /rel="canonical"/.test(sourcesHtml));
ok('sources page has og:title', /property="og:title"/.test(sourcesHtml));
ok('sources page has favicon', /rel="icon"/.test(sourcesHtml));
ok('sources page retry is wired', /id="sources-retry"/.test(sourcesJs));
[...sourcesHtml.matchAll(/<label for="([^"]+)"/g)]
  .forEach((m) => ok('sources label[for] -> #' + m[1], sourcesHtml.includes('id="' + m[1] + '"')));

/* ----------------------------------------------------- 9. static breeds */
section('Static breed pages');
const BREED_DIRS = fs.readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let breedPages = 0;
BREED_DIRS.forEach((dir) => {
  fs.readdirSync(path.join(ROOT, 'public', dir))
    .filter((file) => file.endsWith('.html'))
    .forEach((file) => {
      breedPages++;
      const pagePath = 'public/' + dir + '/' + file;
      const page = read(pagePath);
      const label = dir + '/' + file;

      ok(label + ' has a title', /<title>[^<]{10,}<\/title>/.test(page));
      ok(label + ' has a meta description', /name="description" content="[^"]{40,}"/.test(page));
      ok(label + ' has canonical', /rel="canonical" href="https:\/\/pet-care-guide\.vercel\.app\/[^"]+"/.test(page));
      ok(label + ' has og:title', /property="og:title"/.test(page));
      ok(label + ' has twitter:card', /name="twitter:card"/.test(page));
      ok(label + ' has favicon', /rel="icon"/.test(page));
      ok(label + ' has lang', /<html lang="en">/.test(page));
      ok(label + ' has one h1', (page.match(/<h1/g) || []).length === 1);
      ok(label + ' links to the live form', /href="\/index\.html\?type=/.test(page));
      ok(label + ' links to sources', /href="\/sources\.html\?type=/.test(page));
      ok(label + ' carries a vet disclaimer', /class="vet-note"/.test(page));
      ok(label + ' warns about sellers', /trader-warning|Verify health records/.test(page));
      ok(label + ' has hazards', /Toxic foods|keypoint-label/.test(page));
      ok(label + ' escapes its own slugs', !/\?type=\w+\s/.test(page));

      // Every internal link must resolve to a file we actually ship.
      [...page.matchAll(/(?:href|src)="(\/[a-z0-9\/-]+\.(?:html|css|js|svg|xml))"/g)]
        .map((m) => m[1])
        .forEach((href) => {
          const clean = href.split('#')[0].split('?')[0];
          ok(label + ' link ' + href + ' exists', fs.existsSync(path.join(ROOT, 'public', clean)));
        });
    });
});

ok('generated 10-15 breed pages', breedPages >= 10 && breedPages <= 15, 'got ' + breedPages);
ok('sitemap exists', fs.existsSync(path.join(ROOT, 'public', 'sitemap.xml')));
const sitemap = read('public/sitemap.xml');
ok('sitemap lists the home page', /<loc>https:\/\/pet-care-guide\.vercel\.app\/<\/loc>/.test(sitemap));
ok('sitemap lists breed pages', (sitemap.match(/<url>/g) || []).length === breedPages + 2);
BREED_DIRS.forEach((dir) => {
  ok('sitemap covers /' + dir + '/', sitemap.includes('/' + dir + '/'));
});

/* --------------------------------------------------------- 10. CSS layout */
section('CSS layout');
const css = read('public/style.css');

// The unit select inherits a 2.6rem chevron gutter from .select-field select.
// In a narrow box that hides the text, so it must be overridden.
const unitRule = (css.match(/\.unit-field select \{[^}]*\}/) || [])[0] || '';
ok('unit select overrides inherited padding', /\bpadding:/.test(unitRule), unitRule);
const baseGutter = (css.match(/\.select-field select \{[^}]*\}/) || [])[0] || '';
const baseRight = (baseGutter.match(/padding:\s*[^;]*?([\d.]+)rem\s+[\d.]+rem/) || [])[1];
const unitRight = (unitRule.match(/padding:[^;]*?([\d.]+)rem\s+([\d.]+)rem/) || [])[1];
ok('unit select right padding is smaller than the base chevron gutter',
  !baseRight || !unitRight || parseFloat(unitRight) < parseFloat(baseRight),
  'base ' + baseRight + 'rem vs unit ' + unitRight + 'rem');
ok('unit select is not centred with a large left pad',
  !/text-align:\s*center/.test(unitRule), unitRule);

const column = (css.match(/\.field-group-inline \{[^}]*grid-template-columns:\s*1fr\s+([\d.]+)rem/) || [])[1];
if (column) {
  const left = parseFloat((unitRule.match(/padding:[^;]*?[\d.]+rem\s+([\d.]+)rem/) || [])[1] || '0.6');
  const right = parseFloat(unitRight || '1.45');
  const contentRem = parseFloat(column) - left - right;
  ok('unit box leaves room for "kg" at 0.95rem', contentRem > 1.2,
    'column ' + column + 'rem minus ' + left + 'rem + ' + right + 'rem = ' + contentRem.toFixed(2) + 'rem');
} else {
  ok('unit column width is declared', false);
}

ok('inputs stay at 16px or larger',
  /\.field input,\s*[\s\S]{0,80}font-size:\s*1rem/.test(css));

/* ------------------------------------------ 10b. no duplicated page logic */
section('Shared helpers');

// Escaping untrusted SerpAPI strings must have exactly one implementation.
const utils = read('public/utils.js');
['index.html', 'sources.html'].forEach((page) => {
  const html = read('public/' + page);
  ok(page + ' loads utils.js', /<script src="utils\.js"><\/script>/.test(html));
  const before = html.indexOf('utils.js');
  ok(page + ' loads utils.js before its page script',
    before > -1 && before < html.indexOf('script.js') ||
    before > -1 && before < html.indexOf('sources.js'));
});
ok('utils.js defines escapeHtml and mapsHref once each',
  (utils.match(/PetGuide\.escapeHtml =/g) || []).length === 1 &&
  (utils.match(/PetGuide\.mapsHref =/g) || []).length === 1);
ok('utils.js escapes all five dangerous characters',
  /&amp;/.test(utils) && /&lt;/.test(utils) && /&gt;/.test(utils) && /&quot;/.test(utils) && /&#39;/.test(utils));

const pageScripts = { 'script.js': read('public/script.js'), 'sources.js': read('public/sources.js') };
Object.keys(pageScripts).forEach((file) => {
  const code = pageScripts[file];
  ok(file + ' declares escapeHtml once', (code.match(/function escapeHtml\(/g) || []).length === 1);
  ok(file + ' declares mapsHref once', (code.match(/function mapsHref\(/g) || []).length === 1);
  ok(file + ' delegates escaping to utils.js', /return window\.PetGuide\.escapeHtml\(/.test(code));
  ok(file + ' delegates map links to utils.js', /return window\.PetGuide\.mapsHref\(/.test(code));
  // Escaping has one implementation, so the entity replacements live only in
  // utils.js. Other .replace() calls (phone digits, gibberish checks) are fine.
  ok(file + ' does not inline HTML entity escaping',
    !/&amp;|&quot;|&#39;/.test(code));
});

// Maps links built from API data must not interpolate raw values into a URL.
// Strip the already-encoded calls first, so the raw pattern inside
// encodeURIComponent(...) is not mistaken for an unencoded one.
const utilsUnencoded = utils.replace(/encodeURIComponent\([^)]*\)/g, 'ENCODED');
ok('map coordinates are URL-encoded, not interpolated raw',
  !/gps_coordinates\.(lat|lng)\s*\+/.test(utilsUnencoded),
  (utilsUnencoded.match(/gps_coordinates\.[^\n]*/) || [])[0] || '');
ok('shop text in map links is URL-encoded',
  /encodeURIComponent\(q\)/.test(utils));

/* ------------------------------------------------- 10c. no dead references */
section('Dead code');
// The full sources page must be reachable from the home page.
ok('home page links to the full sources page', /href="\/sources\.html"/.test(html));
ok('sources link carries the current search', /updateSourcesLink\(\)/.test(script));

// It must read as a prominent destination, not a quiet inline link.
const browseLink = (html.match(/<a[^>]*id="sources-browse-link"[^>]*>/) || [])[0] || '';
ok('sources browse link is styled as a button', /class="[^"]*\bbtn\b/.test(browseLink), browseLink);
ok('sources browse link uses the large button size', /\bbtn-large\b/.test(browseLink), browseLink);
const largeRule = (css.match(/\.btn-large \{[^}]*\}/) || [])[0] || '';
const primaryRule = (css.match(/\.btn-primary \{[^}]*\}/) || [])[0] || '';
const largeH = parseFloat((largeRule.match(/min-height:\s*([\d.]+)rem/) || [])[1] || '0');
const primaryH = parseFloat((primaryRule.match(/min-height:\s*([\d.]+)rem/) || [])[1] || '0');
ok('large button is taller than the primary button', largeH > primaryH,
  largeH + 'rem vs ' + primaryH + 'rem');
ok('large button font is larger than the primary button font',
  parseFloat((largeRule.match(/font-size:\s*([\d.]+)rem/) || [])[1] || '0') >
  parseFloat((primaryRule.match(/font-size:\s*([\d.]+)rem/) || [])[1] || '0'));
ok('anchor buttons do not get an underline', /a\.btn \{[^}]*text-decoration:\s*none/.test(css));
ok('pill buttons keep their radius on focus',
  /\.btn-primary:focus-visible \{[^}]*radius-pill/.test(css));
ok('sources browse link has styles', /\.sources-browse\b/.test(css));

// An unconfigured deployment must say so plainly rather than looking broken.
ok('server reports missing source config with a code',
  /sources_not_configured/.test(server));
// Scope to the route body: the provider function is declared earlier in the
// file, so a whole-file index comparison finds the wrong occurrence.
const sourcesRoute = (server.slice(server.indexOf("app.post('/api/pet-sources'"))
  .match(/^[\s\S]*?^\}/m) || [''])[0];
ok('server checks the source key before calling the provider',
  sourcesRoute.includes('!process.env.SERPAPI_KEY') &&
  sourcesRoute.indexOf('!process.env.SERPAPI_KEY') < sourcesRoute.indexOf('searchPetSources(petType, breed'));
ok('sources page surfaces the unconfigured message', /sources_not_configured/.test(sourcesJs));
ok('home page surfaces the unconfigured message', /sources_not_configured/.test(script));

// The full sources page and its ordering controls must remain present.
ok('sources page is a separate page', /id="sources-root"/.test(sourcesHtml) || /sources\.js/.test(sourcesHtml));
['sort-filter', 'type-filter'].forEach((id) => {
  ok('sources page has the ' + id + ' control', sourcesHtml.includes('id="' + id + '"'));
});
ok('sorting is implemented', /sortFilter\.value/.test(sourcesJs) && /\.sort\(/.test(sourcesJs));
ok('each result offers a link', /class="source-link"/.test(sourcesJs) && /class="source-link"/.test(script));

// Class names can arrive from JS template strings, so scan every shipped
// HTML and JS file rather than markup alone.
const allPublic = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(html|js)$/.test(entry.name)) allPublic.push(fs.readFileSync(full, 'utf8'));
  });
})(path.join(ROOT, 'public'));
const publicSource = allPublic.join('\n');

// Classes rendered by the current source card must keep their styling.
['source-name', 'source-snippet', 'source-badge', 'source-caution', 'source-address']
  .forEach((cls) => {
    ok('.' + cls + ' is used', new RegExp(cls).test(publicSource));
    ok('.' + cls + ' is styled', new RegExp('\\.' + cls + '\\b').test(css));
  });

// Classes left over from the old sources page must be gone from both sides.
['source-header', 'source-type', 'sources-disclaimer']
  .forEach((cls) => {
    ok('dead class .' + cls + ' is not styled', !new RegExp('\\.' + cls + '\\b').test(css));
    ok('dead class .' + cls + ' is not in markup', !new RegExp(cls).test(publicSource));
  });

// Specificity, not !important, should carry the snippet colour.
ok('source snippet colour is set by specificity, not !important',
  /\.source-card p\.source-snippet \{[^}]*color:/.test(css) &&
  !/\.source-card p\.source-snippet \{[^}]*!important/.test(css));

const errorCopy = (script.match(/var ERROR_COPY = \{([\s\S]*?)\n  \}/) || [])[1] || '';
const errorKeys = [...errorCopy.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
ok('error messages are defined', errorKeys.length > 0);
errorKeys.forEach((key) => {
  const uses = (script.match(new RegExp('ERROR_COPY\\.' + key + '\\b', 'g')) || []).length;
  ok('error message "' + key + '" is used', uses > 0, 'defined but never referenced');
});

/* ------------------------------------------------------------ 11. tracker */
section('Daily tracker');
const trackerHtml = read('public/tracker.html');
const trackerJs = read('public/tracker.js');
const petDataJs = read('public/pet-data.js');

// Every id the script looks up must exist in the page.
const trackerRefs = [...trackerJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const trackerIds = new Set([...trackerHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
ok('tracker has elements', trackerIds.size > 15);
trackerRefs.forEach((id) => {
  ok('tracker script finds #' + id, trackerIds.has(id), 'missing id: ' + id);
});

// The tracker must not show a routine until the care guide has been told the pet.
ok('tracker has a gate section', /id="tracker-gate"/.test(trackerHtml));
ok('the gate asks for the pet details first', /Tell us about your pet first/.test(trackerHtml));
ok('the gate sends them to the care guide', /href="\/"[^>]*>Go to the care guide/.test(trackerHtml));
ok('the gate starts hidden', /tracker-gate hidden"/.test(trackerHtml));
ok('the tracker body starts hidden', /class="hidden" id="tracker-body"/.test(trackerHtml));
ok('tracker reads the pet saved by the care guide', /petCareGuide\.pet\.v1/.test(trackerJs));
ok('the care guide saves the pet it searched for',
  /petCareGuide\.pet\.v1/.test(script) && /rememberPet\(request\)/.test(script));
// Recorded before the fetch, so an unconfigured or failing API still unlocks it.
ok('the pet is recorded before the API call',
  script.indexOf('rememberPet(request);') < script.indexOf("fetch('/api/pet-info'"),
  'rememberPet must run before the request');
ok('tracker returns early when there is no pet', /if \(!pet\) \{/.test(trackerJs));
ok('tracker hides the body until a pet is known',
  /setShown\(el\.gate, true\);\s*setShown\(el\.body, false\);/.test(trackerJs));

// Hiding must use the .hidden class: .info-card and .week-stats are display:grid
// and would win against the native hidden attribute.
ok('tracker uses no native hidden attributes', !/\shidden(\s|>)/.test(trackerHtml),
  'a bare hidden attribute is ignored by display:grid rules');
ok('visibility is toggled with the hidden class', /classList\.toggle\('hidden'/.test(trackerJs));

// The checklist is built per species, so it must not be hard-coded in the HTML.
ok('checklist is a fieldset', /<fieldset class="tracker-checklist" id="checklist">/.test(trackerHtml));
ok('the fieldset ships only its legend',
  !/type="checkbox"/.test(trackerHtml), 'checkboxes must be generated from the routine');
ok('checkboxes are created as real inputs',
  /input\.type = 'checkbox'/.test(trackerJs));
ok('each generated checkbox is labelled',
  /chip\.setAttribute\('for', input\.id\)/.test(trackerJs) && /chip\.className = 'check-chip'/.test(trackerJs));
ok('the checklist is rebuilt from the species routine',
  /function routineFor/.test(petDataJs) && /window\.PetData\.routine\(petType\)/.test(trackerJs));
ok('a species without exercise hides the minutes field',
  /setShown\(el\.minutesField, hasActivity\)/.test(trackerJs));
ok('a species without exercise hides the exercised stat',
  /setShown\(el\.statExerciseBox, hasActivity\)/.test(trackerJs));
ok('there is a noscript note for the generated checklist', /<noscript>/.test(trackerHtml));

// Diet guidance is shown and comes from the species and age stage.
ok('tracker shows a diet note', /id="diet-note"/.test(trackerHtml));
ok('the diet note uses the species and age stage', /dietNoteFor\(type, state\.profile\.ageStage\)/.test(trackerJs));
ok('diet advice is caveated to a vet', /vet/i.test(trackerHtml));

// Labels must not sit on top of values they cannot float away from.
ok('the date field uses a static label', /class="field field-static"/.test(trackerHtml));
ok('static labels are taken out of the floating pattern',
  /\.field-static label \{[^}]*position: static/.test(css));
ok('the notes field does not inherit the floating label',
  !/class="field tracker-notes"/.test(trackerHtml));
ok('no placeholder is set on the date input', !/id="entry-date"[^>]*placeholder/.test(trackerHtml));

// Fields the user needs.
ok('tracker captures diet', /id="pet-diet"/.test(trackerHtml));
ok('tracker captures calories given', /id="entry-calories"/.test(trackerHtml));
ok('tracker captures a daily calorie target', /id="pet-calorie-target"/.test(trackerHtml));
ok('tracker captures weight', /id="entry-weight"/.test(trackerHtml));
ok('tracker lets you pick a past date', /id="entry-date"[^>]*type="date"|type="date"[^>]*id="entry-date"/.test(trackerHtml));

// Storage is local and the user is told so.
ok('tracker uses localStorage', /localStorage/.test(trackerJs));
ok('tracker says data stays in the browser', /browser only|blocking local storage/.test(trackerHtml + trackerJs));
ok('tracker has a delete-all control', /id="clear-all-btn"/.test(trackerHtml));
ok('tracker survives blocked storage',
  /try \{[\s\S]{0,200}localStorage\.setItem[\s\S]{0,120}\} catch/.test(trackerJs));
ok('tracker is excluded from search indexing', /name="robots" content="noindex/.test(trackerHtml));

// Reachable from every page.
ok('home page links to the tracker', /href="\/tracker\.html"/.test(html));
ok('sources page links to the tracker', /href="\/tracker\.html"/.test(sourcesHtml));
const firstBreedDir = BREED_DIRS[0];
const firstBreedPage = fs.readdirSync(path.join(ROOT, 'public', firstBreedDir))
  .filter((f) => f.endsWith('.html'))
  .map((f) => read('public/' + firstBreedDir + '/' + f))[0] || '';
ok('breed pages link to the tracker', /href="\/tracker\.html"/.test(firstBreedPage), firstBreedDir);
ok('home page shows a tracker button', /class="btn btn-secondary btn-large" href="\/tracker\.html"/.test(html));
ok('tracker is not in the sitemap', !/tracker\.html/.test(sitemap));
ok('tracker styles exist', /\.week-strip \{/.test(css) && /\.check-chip-body \{/.test(css));
ok('gate styles exist', /\.tracker-gate-text \{/.test(css));

/* ------------------------------------------------- 12. species routine data */
section('Species routines and diet');

ok('PetData exposes types()', typeof PetData.types === 'function');
const species = PetData.types();
ok('types() lists every species', species.length >= 9, species.join(', '));

species.forEach((name) => {
  const routine = PetData.routine(name);
  ok('routine exists for ' + name, Array.isArray(routine) && routine.length >= 5, name);

  const keys = routine.map((r) => r.key);
  ok('routine keys are unique for ' + name, new Set(keys).size === keys.length, keys.join(','));

  const roles = routine.map((r) => r.role);
  ok('routine for ' + name + ' has a food item', roles.includes('food'), roles.join(','));
  ok('routine for ' + name + ' has a water item', roles.includes('water'), roles.join(','));
  ok('food key resolves for ' + name, PetData.foodKey(name) === keys[roles.indexOf('food')]);

  ok('every item in ' + name + ' is labelled', routine.every((r) => typeof r.label === 'string' && r.label.length));
  ok('every item in ' + name + ' has a safe key', routine.every((r) => /^[a-z][a-z0-9]*$/.test(r.key)));

  const note = PetData.dietNote(name, 'Adult (1-5 years)');
  ok('diet note exists for ' + name, typeof note === 'string' && note.length > 20);
});

// A fish tank has no walk; a routine must not offer one.
ok('fish have no exercise item', PetData.activityKey('Fish') === '', PetData.activityKey('Fish'));
ok('fish still have a food item', PetData.foodKey('Fish') === 'food');
ok('fish have water and habitat items instead',
  PetData.routine('Fish').some((r) => r.role === 'habitat'));
ok('reptiles have no exercise item', PetData.activityKey('Reptile') === '');
ok('dogs do have an exercise item', PetData.activityKey('Dog') === 'walk');
ok('measuresActivity flags fish as false', PetData.measuresActivity('Fish') === false);
ok('measuresActivity flags dogs as true', PetData.measuresActivity('Dog') === true);

// Species-specific wording, so the diet is genuinely tailored.
ok('rabbit diet leads with hay', /hay/i.test(PetData.dietNote('Rabbit', 'Adult (1-5 years)')));
ok('guinea pig diet avoids muesli', /muesli/i.test(PetData.dietNote('Guinea Pig', 'Adult (1-5 years)')));
ok('horse diet warns against withholding hay',
  /never withhold hay/i.test(PetData.dietNote('Horse', 'Adult (1-5 years)')));
ok('fish diet warns about overfeeding',
  /overfeeding|fouled water/i.test(PetData.dietNote('Fish', 'Adult (1-5 years)')));
ok('cat diet mentions wet food', /wet food/i.test(PetData.dietNote('Cat', 'Adult (1-5 years)')));

// Age stage changes the guidance.
const senior = PetData.dietNote('Dog', 'Senior (5 years and up)');
const young = PetData.dietNote('Dog', 'Young (under 1 year)');
ok('senior stage changes the diet note', /older pets/i.test(senior), senior);
ok('young stage changes the diet note', /young ones/i.test(young), young);
ok('adult stage keeps the plain note',
  PetData.dietNote('Dog', 'Adult (1-5 years)') === PetData.dietNote('Dog', ''),
  PetData.dietNote('Dog', 'Adult (1-5 years)'));

/* --------------------------------------------- 13. tracker data-layer maths */
// Exercise the storage and maths logic without a browser. Only the pure data
// layer runs here: everything after the wiring banner needs a real DOM.
const WIRING_MARKER = 'function populateTypes';
const wiringAt = trackerJs.indexOf(WIRING_MARKER);
ok('tracker has a testable seam before the DOM wiring', wiringAt > 0);
if (wiringAt > 0) {
  const store = {};
  const ctx = {
    window: {},
    // The data layer only builds its element map at load time; nothing
    // dereferences it before the wiring section.
    document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {} },
    JSON, Math, Date, Number, String, Object, Array, isFinite, RegExp, console
  };
  ctx.window.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  };
  vm.createContext(ctx);
  // pet-data.js loads before tracker.js in the page, so do the same here or the
  // tracker's species validation has no list to check against.
  vm.runInContext(petDataJs, ctx);
  // The slice already sits inside the module's own IIFE, so close that one
  // rather than wrapping it in another function.
  vm.runInContext(trackerJs.slice(0, wiringAt) + '\n})();', ctx);
  var Tracker = ctx.window.PetTracker;

  ok('tracker exposes its helpers', !!Tracker && typeof Tracker.normalise === 'function');

  // The gate: no saved pet means no routine.
  ok('no saved pet yields null', Tracker.readPetProfile() === null);
  store['petCareGuide.pet.v1'] = JSON.stringify({ petType: 'Dog', breed: 'Poodle', ageStage: 'Adult (1-5 years)' });
  ok('a saved pet is read back', (Tracker.readPetProfile() || {}).petType === 'Dog');
  store['petCareGuide.pet.v1'] = JSON.stringify({ petType: 'Dragon', breed: '' });
  ok('an unknown species is refused', Tracker.readPetProfile() === null);
  store['petCareGuide.pet.v1'] = JSON.stringify({ breed: 'Poodle' });
  ok('a pet with no species is refused', Tracker.readPetProfile() === null);
  store['petCareGuide.pet.v1'] = '{not json';
  ok('corrupt saved pet data is refused', Tracker.readPetProfile() === null);

  // Escaping lives in the tested layer, because pet names reach innerHTML.
  ok('escapeHtml neutralises markup', Tracker.escapeHtml('<img src=x onerror="a">') === '&lt;img src=x onerror=&quot;a&quot;&gt;');
  ok('escapeHtml handles null', Tracker.escapeHtml(null) === '');
}

// A hostile or half-written stored record must not produce undefined fields.
const nasty = Tracker.normalise({
  profile: { name: 'x'.repeat(200), diet: null, calorieTarget: 'abc', petType: 'Dragon' },
  entries: {
    '2026-10-04': { fed: 'yes', calories: '99999', minutes: -5, weight: 'abc', weightUnit: 'xx', notes: 'n'.repeat(900) },
    'not-a-date': { fed: true },
    '2026-10-05': null
  }
});
ok('profile name is length-capped', nasty.profile.name.length === 40, nasty.profile.name.length + ' chars');
ok('null diet becomes an empty string', nasty.profile.diet === '');
ok('non-numeric calorie target is dropped', nasty.profile.calorieTarget === '');
ok('an unknown species is rejected', nasty.profile.petType === '', nasty.profile.petType);
ok('invalid date keys are discarded', !('not-a-date' in nasty.entries));
const day = nasty.entries['2026-10-04'];
ok('a string in a checkbox slot is not treated as done', day.fed === undefined, String(day.fed));
ok('calories are clamped to the allowed range', day.calories === '5000', day.calories);
ok('minutes are clamped to the allowed range', day.minutes === '0', day.minutes);
ok('non-numeric weight is dropped', day.weight === '', day.weight);
ok('unknown weight unit falls back to kg', day.weightUnit === 'kg');
ok('notes are length-capped', day.notes.length === 500, day.notes.length + ' chars');

// Species checklists use different keys, so arbitrary booleans must survive.
const switched = Tracker.normalise({
  profile: { petType: 'Fish' },
  entries: { '2026-10-04': { food: true, water: true, filter: false, notes: 'ammonia high' } }
});
ok('a fish routine key survives normalisation', switched.entries['2026-10-04'].food === true);
ok('an unticked fish key stays false', switched.entries['2026-10-04'].filter === false);
ok('a routine key does not become a string', switched.entries['2026-10-04'].water === true);
ok('blank entry carries the numeric fields',
  ['calories', 'minutes', 'weight', 'weightUnit', 'notes'].every((k) => k in Tracker.blankEntry()));

// Date maths must cross month and year boundaries correctly.
ok('date maths crosses a month boundary', Tracker.shiftIso('2026-10-01', -1) === '2026-09-30',
  Tracker.shiftIso('2026-10-01', -1));
ok('date maths crosses a year boundary', Tracker.shiftIso('2026-01-01', -1) === '2025-12-31',
  Tracker.shiftIso('2026-01-01', -1));
ok('date maths handles a leap day', Tracker.shiftIso('2026-03-01', -1) === '2026-02-28',
  Tracker.shiftIso('2026-03-01', -1));
ok('date maths crosses a leap day', Tracker.shiftIso('2024-03-01', -1) === '2024-02-29',
  Tracker.shiftIso('2024-03-01', -1));
ok('date maths formats with padding', Tracker.toIso(new Date(2026, 0, 5)) === '2026-01-05',
  Tracker.toIso(new Date(2026, 0, 5)));
ok('date maths rejects rubbish input', Tracker.shiftIso('nope', -1) === '');

console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed'));
process.exit(failures ? 1 : 0);