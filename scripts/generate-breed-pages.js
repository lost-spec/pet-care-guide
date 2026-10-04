#!/usr/bin/env node
/**
 * generate-breed-pages.js — builds a static landing page per popular breed.
 *
 * Deterministic and idempotent: same input, same output. Run with:
 *   npm run build
 *
 * Pages are plain HTML that link straight into the live form with prefilled
 * state, so they stay useful without duplicating any API logic. Also writes
 * sitemap.xml.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const ORIGIN = 'https://pet-care-guide.vercel.app';

// Reuse the live hazard and life-stage data so pages cannot drift from the app.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(PUBLIC, 'pet-data.js'), 'utf8'), sandbox);
const PetData = sandbox.window.PetData;

/**
 * Typical adult weights are broad published ranges, deliberately framed as
 * "typical" rather than exact. Exact figures must come from a vet.
 */
const BREEDS = [
  { type: 'Dog', name: 'Labrador Retriever', weight: '55-80 lb (25-36 kg)', note: 'Labradors are prone to carrying extra weight, so portion control matters more than for most breeds.' },
  { type: 'Dog', name: 'Golden Retriever', weight: '55-75 lb (25-34 kg)', note: 'Goldens eat almost anything offered. Measured meals beat free-feeding.' },
  { type: 'Dog', name: 'German Shepherd', weight: '50-90 lb (23-41 kg)', note: 'A large, slow-maturing breed, so adult nutrition can start later than expected.' },
  { type: 'Dog', name: 'French Bulldog', weight: 'under 28 lb (under 13 kg)', note: 'Small but heat sensitive. Never exercise in warm weather and avoid weight gain, which stresses the airways.' },
  { type: 'Dog', name: 'Beagle', weight: '13-18 lb (6-8 kg)', note: 'Beagles are highly food motivated, so split meals and use food as training rewards sparingly.' },
  { type: 'Dog', name: 'Poodle', weight: 'Standard 45-70 lb (20-32 kg)', note: 'Poodles range from toy to standard; portion size should follow the size you actually have.' },
  { type: 'Dog', name: 'Border Collie', weight: '30-55 lb (14-25 kg)', note: 'A working breed that burns a lot of energy. Underfeeding an active adult is easy to do.' },
  { type: 'Cat', name: 'Maine Coon', weight: '8-18 lb (3.6-8 kg)', note: 'One of the larger domestic cats and still growing slowly, up to about four years.' },
  { type: 'Cat', name: 'Siamese', weight: '7-12 lb (3-5.5 kg)', note: 'Siamese are lean and vocal, and often graze rather than eat set meals.' },
  { type: 'Cat', name: 'Domestic Shorthair', weight: '8-12 lb (3.6-5.5 kg)', note: 'Mixed-breed cats vary widely. Body condition scoring matters more than a breed chart.' },
  { type: 'Cat', name: 'Bengal', weight: '8-15 lb (3.6-7 kg)', note: 'Bengals are highly active and benefit from several small meals plus puzzle feeders.' },
  { type: 'Rabbit', name: 'Holland Lop', weight: '3-4 lb (1.4-1.8 kg)', note: 'Unlimited timothy hay is the foundation of the diet; pellets are a supplement, not the meal.' },
  { type: 'Bird', name: 'Budgerigar', weight: '1-1.5 oz (30-40 g)', note: 'Seed-only diets are the main cause of early budgie illness. Pellets plus fresh greens is safer.' },
  { type: 'Fish', name: 'Betta', weight: '0.1-0.2 oz (3-5 g)', note: 'Bettas need a heated, filtered tank and only a small amount of food twice daily.' },
  { type: 'Reptile', name: 'Bearded Dragon', weight: 'adults 14-21 oz (400-600 g)', note: 'Juveniles eat far more often than adults. Heat and UVB are the two things that must be right.' }
];

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const noun = (type) => PetData.noun(type).toLowerCase();

function relatedFor(breed) {
  return BREEDS.filter((other) => other.type === breed.type && other !== breed)
    .slice(0, 4)
    .concat(BREEDS.filter((other) => other.type !== breed.type).slice(0, Math.max(0, 4 - BREEDS.filter((o) => o.type === breed.type && o !== breed).length)))
    .slice(0, 4);
}

function pageFor(breed) {
  const type = breed.type;
  const slugName = slug(breed.name);
  const path_ = `/${type.toLowerCase()}/${slugName}.html`;
  const url = ORIGIN + path_;
  const searchParams = new URLSearchParams({ type, breed: breed.name });
  const sourcesParams = new URLSearchParams({ type, breed: breed.name });
  const stages = PetData.stages(type);
  const hazards = PetData.hazards(type);
  const title = `${breed.name} Care Guide: Feeding, Habitat & Safety`;
  const description = `Care guidance for ${breed.name}s: typical adult weight ${breed.weight}, ${stages.length} life stages to plan for, and the toxic foods and hazards to keep away.`;

  const hazardHtml = hazards.map((hazard) =>
    '        <div class="keypoint-card" role="listitem">\n' +
    `          <div class="keypoint-label">${escapeHtml(hazard.label)}</div>\n` +
    `          <div class="keypoint-value">${escapeHtml(hazard.value)}</div>\n` +
    '        </div>').join('\n');

  const stageHtml = stages.map((stage) => `<li>${escapeHtml(stage)}</li>`).join('\n            ');

  const relatedHtml = relatedFor(breed).map((other) =>
    `            <li><a href="/${other.type.toLowerCase()}/${slug(other.name)}.html">${escapeHtml(other.name)}</a> <span class="muted">(${escapeHtml(other.type)})</span></li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Pet Care Guide</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#2d6a4f" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0c1f18" media="(prefers-color-scheme: dark)">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Pet Care Guide">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ORIGIN}/og-image.svg">
  <meta property="og:locale" content="en_US">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ORIGIN}/og-image.svg">

  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="aurora" aria-hidden="true"></div>
  <a class="skip-link" href="#breed-title">Skip to content</a>

  <div class="page-wrapper">
    <div class="container">

      <header class="hero">
        <h1 class="hero-title" id="breed-title">${escapeHtml(breed.name)} Care Guide</h1>
        <p class="hero-tagline">Feeding, habitat and safety for the ${escapeHtml(noun(type))} you own</p>
      </header>

      <main class="main-content">

        <div class="sources-header">
          <div class="breadcrumb"><a href="/">&larr; Back to Search</a></div>
        </div>

        <section class="info-card glass-card reveal" aria-labelledby="quick-facts">
          <header class="info-card-head">
            <span class="pill pill-feeding" aria-hidden="true">📏</span>
            <h2 class="info-card-title" id="quick-facts">Quick facts</h2>
          </header>
          <div class="keypoint-grid" role="list">
            <div class="keypoint-card" role="listitem">
              <div class="keypoint-label">Pet type</div>
              <div class="keypoint-value">${escapeHtml(type)}</div>
            </div>
            <div class="keypoint-card" role="listitem">
              <div class="keypoint-label">Typical adult weight</div>
              <div class="keypoint-value">${escapeHtml(breed.weight)}</div>
            </div>
            <div class="keypoint-card" role="listitem">
              <div class="keypoint-label">Life stages</div>
              <div class="keypoint-value">${stages.length} to plan for</div>
            </div>
          </div>
          <p class="detail-note">${escapeHtml(breed.note)}</p>
        </section>

        <section class="info-card glass-card reveal" aria-labelledby="life-stages">
          <header class="info-card-head">
            <span class="pill pill-environment" aria-hidden="true">🗓️</span>
            <h2 class="info-card-title" id="life-stages">Life stages</h2>
          </header>
          <ul class="plain-list">
            ${stageHtml}
          </ul>
          <p class="detail-note">Portions change at every stage. Pick the closest match when you search below.</p>
        </section>

        <section class="warnings-card reveal" aria-labelledby="breed-hazards">
          <header class="warnings-head">
            <span class="pill pill-warning" aria-hidden="true">⚠️</span>
            <h2 class="warnings-title" id="breed-hazards">Worth knowing: toxic foods &amp; hazards</h2>
          </header>
          <div class="keypoint-grid" role="list">
${hazardHtml}
          </div>
        </section>

        <div class="trader-warning">
          <strong>Getting one from a breeder or marketplace?</strong>
          <span>Shelters and rescues come first. If you use a breeder or marketplace listing, verify
            the seller before paying: ask to see the parents, request written health and vaccination
            records, avoid sellers who will not let you visit, and be wary of puppy-mill listings and
            payment requests made through chat or wire transfer.</span>
        </div>

        <section class="info-card glass-card reveal" aria-labelledby="cta-title">
          <header class="info-card-head">
            <span class="pill pill-sources" aria-hidden="true">✨</span>
            <h2 class="info-card-title" id="cta-title">Guidance for your own ${escapeHtml(breed.name)}</h2>
          </header>
          <p>Feeding and habitat advice changes with life stage and weight. Get a version for your pet, then look up shelters and rescues nearby.</p>
          <div class="cta-row">
            <a class="btn btn-primary" href="/index.html?${searchParams.toString()}">Get care info</a>
            <a class="btn btn-secondary" href="/sources.html?${sourcesParams.toString()}">Find a shelter or seller</a>
          </div>
        </section>

        <p class="vet-note">
          <span aria-hidden="true">🩺</span>
          <span>Weights are typical published ranges and your ${escapeHtml(type.toLowerCase())} may differ.
            Confirm portions, diets and any health question with your vet.</span>
        </p>

        <section class="info-card glass-card reveal" aria-labelledby="related-title">
          <header class="info-card-head">
            <span class="pill pill-sources" aria-hidden="true">🔗</span>
            <h2 class="info-card-title" id="related-title">Related care guides</h2>
          </header>
          <ul class="plain-list">
${relatedHtml}
          </ul>
        </section>

      </main>

      <footer class="site-footer">
        <p class="disclaimer">General guidance only. Consult a vet for specific health or diet decisions.</p>
        <nav class="footer-nav" aria-label="Site sections">
          <a href="/">Care guide</a>
          <a href="/sources.html">Sources</a>
          <a href="/tracker.html">Daily tracker</a>
        </nav>
        <p class="copyright">&copy; 2026 Pet Care Guide</p>
      </footer>

    </div>
  </div>

  <script src="/birds.js"></script>
  <script src="/ui.js"></script>
</body>
</html>
`;
}

let written = 0;
const urls = [];

for (const breed of BREEDS) {
  const dir = path.join(PUBLIC, breed.type.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(breed.name)}.html`);
  fs.writeFileSync(file, pageFor(breed), 'utf8');
  urls.push({ loc: ORIGIN + `/${breed.type.toLowerCase()}/${slug(breed.name)}.html`, priority: '0.8' });
  written++;
}

urls.unshift(
  { loc: ORIGIN + '/', priority: '1.0', changefreq: 'weekly' },
  { loc: ORIGIN + '/sources.html', priority: '0.5' }
);

const today = process.env.SOURCE_DATE || new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq || 'monthly'}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Generated ${written} breed pages and sitemap.xml`);
BREEDS.forEach((breed) => console.log('  /' + breed.type.toLowerCase() + '/' + slug(breed.name) + '.html'));