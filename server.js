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

async function callAI(context, retry = false) {
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'openai/gpt-oss-120b';
  const extraHeaders = process.env.LLM_EXTRA_HEADERS ? JSON.parse(process.env.LLM_EXTRA_HEADERS) : {};

  if (!apiKey) {
    throw new Error('LLM_API_KEY environment variable is not set. Add it in Vercel Settings → Environment Variables.');
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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildContextLine(context) }
        ],
        temperature: 0.3,
        max_tokens: 1400
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
    return callAI(context, true);
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