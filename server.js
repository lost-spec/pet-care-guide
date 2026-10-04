require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a pet care expert. Given a pet type, breed, life stage and optionally a weight, respond with ONLY valid JSON, no markdown, no extra text, in exactly this shape:
{
  "summary": string (2-3 sentences),
  "feeding": {
    "keyPoints": [{ "label": string, "value": string }],
    "details": string
  },
  "environment": {
    "keyPoints": [{ "label": string, "value": string }],
    "details": string
  },
  "warnings": [string],
  "hazards": [{ "label": string, "value": string }]
}
Give 4-6 keyPoints per section. Labels must be short (1-3 words).

Tailor feeding and environment guidance to the life stage and weight when they
are provided. Puppies and kittens need more frequent, smaller meals and a
different calorie density than adults. Seniors need fewer calories, more fibre
and softer food. A weight under ~2kg or over ~60kg should be reflected in
portion language. If weight is absent, describe portions relatively (for example
"about 2-3% of body weight") rather than inventing an absolute number.

"hazards" must list 3-6 toxic foods or household hazards specific to this pet
type and breed. Be conservative and accurate:
- only include well-established, widely documented hazards
- never invent a hazard, and never guess at a breed-specific toxin
- say "keep away from" rather than dosing advice
- for species where the list is genuinely shorter, return fewer items
- if you are not confident a hazard applies, leave it out

Do not include URLs, citations or sources of any kind. Do not give medication,
surgery or diagnostic advice; advise consulting a vet instead.

If the breed doesn't exist or isn't a real pet, return { "error": "Unknown breed" }.`;

// "/" is allowed so the "Mixed / Not sure" suggestion is not rejected.
const NAME_REGEX = /^[A-Za-z\s/-]{1,50}$/;
const CONTEXT_REGEX = /^[A-Za-z0-9\s.,()'+\-]{1,60}$/;

function validateInput(petType, breed, extras = {}) {
  if (!petType || !breed) {
    return 'Both petType and breed are required';
  }
  if (typeof petType !== 'string' || typeof breed !== 'string') {
    return 'petType and breed must be strings';
  }
  if (!NAME_REGEX.test(petType) || !NAME_REGEX.test(breed)) {
    return 'Only letters, spaces, hyphens and slashes allowed (max 50 characters)';
  }

  const { ageStage, weight, weightUnit } = extras;

  if (ageStage != null && ageStage !== '') {
    if (typeof ageStage !== 'string' || !CONTEXT_REGEX.test(ageStage)) {
      return 'ageStage contains unsupported characters';
    }
  }

  if (weight != null && weight !== '') {
    const num = Number(weight);
    if (!Number.isFinite(num) || num <= 0 || num > 2000) {
      return 'weight must be a positive number up to 2000';
    }
  }

  if (weightUnit != null && weightUnit !== '' && !['kg', 'lb'].includes(String(weightUnit))) {
    return 'weightUnit must be kg or lb';
  }

  return null;
}

function toKg(weight, unit) {
  if (weight == null || weight === '') return null;
  const num = Number(weight);
  if (!Number.isFinite(num)) return null;
  return unit === 'lb' ? Math.round(num * 0.453592 * 100) / 100 : num;
}

function buildContextLine({ petType, breed, ageStage, weight, weightUnit }) {
  const parts = [`Pet type: ${petType}`, `Breed: ${breed}`];
  if (ageStage) parts.push(`Life stage: ${ageStage}`);
  if (weight != null && weight !== '') {
    const kg = toKg(weight, weightUnit);
    const given = `${weight}${weightUnit === 'lb' ? ' lb' : ' kg'}`;
    parts.push(`Weight: ${given}${kg != null && weightUnit === 'lb' ? ` (~${kg} kg)` : ''}`);
  }
  return parts.join(', ');
}

async function callAI(context, retry = false, options = {}) {
  const systemPrompt = options.systemPrompt || SYSTEM_PROMPT;
  const userContent = options.userContent || buildContextLine(context);
  const temperature = options.temperature != null ? options.temperature : 0.3;
  const maxTokens = options.maxTokens || 1400;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'openai/gpt-oss-120b';
  const extraHeaders = process.env.LLM_EXTRA_HEADERS ? JSON.parse(process.env.LLM_EXTRA_HEADERS) : {};

  if (!apiKey) {
    const err = new Error('LLM_API_KEY environment variable is not set. Add it in Vercel Settings → Environment Variables.');
    err.status = 503;
    err.code = 'ai_not_configured';
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...extraHeaders
  };

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });
  } catch (fetchError) {
    const details = [
      fetchError.message,
      fetchError.code ? `code: ${fetchError.code}` : '',
      fetchError.cause ? `cause: ${fetchError.cause}` : '',
      fetchError.stack ? `stack: ${fetchError.stack}` : ''
    ].filter(Boolean).join(' | ');
    const err = new Error(`Network error for ${baseUrl}/chat/completions: ${details}`);
    err.status = 503;
    throw err;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Surface upstream rate limiting / quota as 429 so the client can say so
    const status = [429, 402, 503].includes(response.status) ? 429 : 500;
    const err = new Error(`API error: ${response.status} ${JSON.stringify(error)} | URL: ${baseUrl}/chat/completions`);
    err.status = status;
    throw err;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    const err = new Error('Empty response from AI');
    err.status = 502;
    throw err;
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    if (retry) {
      const err = new Error('Failed to parse AI response after retry');
      err.status = 502;
      throw err;
    }
    // Pass the same prompts through, or a retry silently re-asks the other task.
    return callAI(context, true, options);
  }
}

app.post('/api/pet-info', async (req, res) => {
  const { petType, breed, ageStage, weight, weightUnit } = req.body;

  const validationError = validateInput(petType, breed, { ageStage, weight, weightUnit });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await callAI({ petType, breed, ageStage, weight, weightUnit });

    if (result.error === 'Unknown breed') {
      return res.status(404).json({ error: 'Unknown breed' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get pet care info. Please try again.' });
  }
});

/* ------------------------------------------------------- tracker review */

const REVIEW_SYSTEM_PROMPT = `You are a pet care expert reviewing one day of a pet owner's own care log.

You are given the pet's species, breed, life stage, their usual diet, the items they ticked as done today, the calories and exercise recorded today, their weight, their own notes, and a 7 day summary.

Respond with ONLY valid JSON, no markdown, no extra text, in exactly this shape:
{
  "verdict": "good" | "watch" | "concern",
  "headline": "one short sentence, max 90 characters",
  "positives": ["1 to 3 short things that went well"],
  "concerns": ["0 to 3 genuine concerns, empty if none"],
  "tips": ["1 to 3 concrete, practical suggestions"],
  "vetNote": "only when something genuinely needs a vet; otherwise an empty string"
}

Rules:
- Use "good" when the day looks unremarkable and appropriate.
- Use "watch" when something is worth keeping an eye on but is not urgent.
- Use "concern" only for something that could harm the animal if it continues.
- Judge the day against what is normal for that species, breed and life stage.
- Never invent numbers. If calories are missing, work around it rather than guessing a figure.
- Be concrete and calm. No scolding, no dramatics, no emoji.
- You are not a vet. Anything medical goes in "vetNote".
- Respect the animal's species. A fish tank has no walk and a rabbit does not need pellets as a main meal.`;

const SPECIES = [
  'Dog', 'Cat', 'Rabbit', 'Hamster', 'Guinea Pig',
  'Bird', 'Fish', 'Reptile', 'Horse'
];

// Everything the log can contain is user input, so cap it hard before it is
// placed in a prompt or echoed back.
function clampText(value, max) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampNumber(value, min, max) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

function validateReview(body) {
  if (!body || typeof body !== 'object') return 'Request body must be an object';
  if (!SPECIES.includes(body.petType)) return 'Unknown petType';
  if (typeof body.petType !== 'string') return 'petType must be a string';

  if (body.routine != null && !Array.isArray(body.routine)) return 'routine must be an array';
  if (Array.isArray(body.routine) && body.routine.length > 12) return 'routine has too many items';

  return null;
}

function buildReviewContext(body) {
  const lines = [`Pet type: ${body.petType}`];

  if (body.breed) lines.push(`Breed: ${clampText(body.breed, 60)}`);
  if (body.ageStage) lines.push(`Life stage: ${clampText(body.ageStage, 60)}`);
  if (body.diet) lines.push(`Usual diet: ${clampText(body.diet, 200)}`);

  const target = clampNumber(body.calorieTarget, 0, 5000);
  if (target) lines.push(`Daily calorie target: ${target} kcal`);

  if (body.date) lines.push(`Date logged: ${clampText(body.date, 10)}`);

  lines.push('Done today:');
  const items = Array.isArray(body.routine) ? body.routine.slice(0, 12) : [];
  if (items.length) {
    items.forEach((item) => {
      const label = clampText(item && item.label, 80);
      if (label) lines.push(`- ${label}: ${item && item.done ? 'yes' : 'no'}`);
    });
  } else {
    lines.push('- nothing ticked');
  }

  const calories = clampNumber(body.calories, 0, 5000);
  if (calories != null) lines.push(`Calories recorded today: ${calories} kcal`);

  const minutes = clampNumber(body.minutes, 0, 600);
  if (minutes != null) lines.push(`Exercise recorded today: ${minutes} minutes`);

  const weight = clampNumber(body.weight, 0, 2000);
  if (weight != null) {
    const kg = toKg(weight, body.weightUnit);
    const unit = body.weightUnit === 'lb' ? 'lb' : 'kg';
    lines.push(`Weight recorded today: ${weight} ${unit}${unit === 'lb' && kg != null ? ` (~${kg} kg)` : ''}`);
  }

  if (body.notes) lines.push(`Owner's notes: ${clampText(body.notes, 400)}`);

  const week = body.week && typeof body.week === 'object' ? body.week : null;
  if (week) {
    const bits = [];
    const fed = clampNumber(week.fedDays, 0, 7);
    const active = clampNumber(week.activeDays, 0, 7);
    const avg = clampNumber(week.avgCalories, 0, 5000);
    const streak = clampNumber(week.streak, 0, 400);
    if (fed != null) bits.push(`${fed} of the last 7 days fed`);
    if (active != null) bits.push(`${active} active`);
    if (avg != null) bits.push(`averaging ${avg} kcal per logged day`);
    if (streak != null) bits.push(`current fed streak ${streak} day(s)`);
    if (bits.length) lines.push(`Last 7 days: ${bits.join(', ')}`);
  }

  return lines.join('\n');
}

// The model is not trusted to return the shape we asked for, so normalise
// before it reaches the page rather than trusting the JSON blindly.
function normaliseReview(result) {
  const source = result && typeof result === 'object' ? result : {};
  const verdict = ['good', 'watch', 'concern'].includes(source.verdict) ? source.verdict : 'watch';

  const list = (value, max) => (Array.isArray(value)
    ? value
      .map((item) => clampText(item, 220))
      .filter(Boolean)
      .slice(0, max)
    : []);

  return {
    verdict,
    headline: clampText(source.headline, 140) || 'Review of the day you logged.',
    positives: list(source.positives, 3),
    concerns: list(source.concerns, 3),
    tips: list(source.tips, 3),
    vetNote: clampText(source.vetNote, 300)
  };
}

app.post('/api/tracker-review', async (req, res) => {
  const validationError = validateReview(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await callAI(req.body, false, {
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userContent: buildReviewContext(req.body),
      temperature: 0.4,
      maxTokens: 900
    });

    res.json(normaliseReview(result));
  } catch (error) {
    console.error('Tracker review error:', error.message);
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || 'Could not review this day. Please try again.',
      code: error.code
    });
  }
});

async function serpFetch(query, apiKey) {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&engine=google&num=10`;

  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const err = new Error(`SerpAPI error: ${response.status} ${JSON.stringify(error)}`);
    err.status = [429, 402].includes(response.status) ? 429 : 502;
    throw err;
  }

  return response.json();
}

function mapShelterResults(results = []) {
  return results.slice(0, 6).map((result) => ({
    name: result.title,
    address: result.address || '',
    phone: result.phone || '',
    rating: result.rating || null,
    reviews: result.reviews || null,
    price_range: '',
    url: result.link || result.website || '',
    snippet: result.snippet || '',
    type: 'shelter',
    place_id: result.place_id || '',
    gps_coordinates: result.gps_coordinates || null,
    hours: result.hours || null
  }));
}

async function searchPetSources(petType, breed, location = '') {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    const err = new Error('SERPAPI_KEY environment variable is not set. Add it in Vercel Settings → Environment Variables.');
    err.status = 500;
    throw err;
  }

  const near = location ? `near ${location}` : '';
  const query = `buy ${breed} ${petType} ${near} price shop breeder`.trim();
  const data = await serpFetch(query, apiKey);

  // Debug log
  console.log('SerpAPI response keys:', Object.keys(data));
  console.log('local_results:', data.local_results?.length || 0);
  console.log('organic_results:', data.organic_results?.length || 0);
  console.log('shopping_results:', data.shopping_results?.length || 0);

  const shops = [];

  // Shelters and rescues are queried separately so they can be listed first.
  // A failure here must not lose the seller results, so it degrades quietly.
  if (location) {
    try {
      const shelterData = await serpFetch(`${petType} ${breed} shelter rescue adoption ${near}`.trim(), apiKey);
      shops.push(...mapShelterResults(shelterData.local_results));
    } catch (shelterError) {
      console.warn('Shelter lookup failed:', shelterError.message);
    }
  }

  if (data.local_results && data.local_results.length > 0) {
    for (const result of data.local_results.slice(0, 10)) {
      shops.push({
        name: result.title,
        address: result.address || result.place_id_search || '',
        phone: result.phone || '',
        rating: result.rating || null,
        reviews: result.reviews || null,
        price_range: result.price || result.price_range || '',
        url: result.link || result.website || '',
        type: 'local',
        place_id: result.place_id || '',
        gps_coordinates: result.gps_coordinates || null,
        hours: result.hours || null
      });
    }
  }

  if (data.shopping_results && data.shopping_results.length > 0) {
    for (const result of data.shopping_results.slice(0, 10)) {
      shops.push({
        name: result.title,
        address: '',
        phone: '',
        rating: result.rating || null,
        reviews: result.reviews || null,
        price_range: result.price || '',
        url: result.link,
        type: 'shopping',
        source: result.source || '',
        delivery: result.delivery || null
      });
    }
  }

  if (data.organic_results && data.organic_results.length > 0) {
    for (const result of data.organic_results.slice(0, 10)) {
      shops.push({
        name: result.title,
        address: '',
        phone: '',
        rating: null,
        reviews: null,
        price_range: '',
        url: result.link,
        snippet: result.snippet,
        type: 'organic',
        displayed_link: result.displayed_link || ''
      });
    }
  }

  return { 
    shops,
    search_metadata: data.search_metadata || {},
    query: query
  };
}

app.post('/api/pet-sources', async (req, res) => {
  const { petType, breed, location } = req.body;

  const validationError = validateInput(petType, breed);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Distinguish "this deployment has no search key" from a real outage, so the
  // page can say so plainly instead of showing a generic server error.
  if (!process.env.SERPAPI_KEY) {
    console.error('SERPAPI_KEY is not set; pet sources are unavailable.');
    return res.status(503).json({
      error: 'Seller and shelter lookup is not switched on for this site yet. The care guidance above still works.',
      code: 'sources_not_configured'
    });
  }

  try {
    const result = await searchPetSources(petType, breed, location || '');
    res.json(result);
  } catch (error) {
    console.error('Pet sources error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to find pet sources. Please try again.' });
  }
});

// Only listen locally, not on Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;