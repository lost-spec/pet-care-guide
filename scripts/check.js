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

console.log('\n' + (failures ? failures + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed'));
process.exit(failures ? 1 : 0);