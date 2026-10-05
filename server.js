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
- A day with no entry in the log means the owner did not record that day. It does not mean the animal went unfed, unexercised or uncared for.
- Only report a gap in care when the recorded days themselves show one: a recorded day ticking food, followed by later recorded days that do not.
- Never tell the owner their animal has gone days without food, water or exercise. The log only covers days the owner actually entered.
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
    const tracked = clampNumber(week.trackedDays, 0, 7);
    const fed = clampNumber(week.fedDays, 0, 7);
    const active = clampNumber(week.activeDays, 0, 7);
    const avg = clampNumber(week.avgCalories, 0, 5000);
    const streak = clampNumber(week.streak, 0, 400);

    // A day with no entry was never recorded, not missed. Telling the model
    // "0 of the last 7 days fed" when the owner only started logging today
    // reads as a week without food, which is both alarming and untrue, so how
    // much of the window actually has data is stated before any counts.
    if (tracked === 0) {
      lines.push('Last 7 days: nothing recorded, so there is no history to judge.');
    } else {
      const bits = [`recorded on ${tracked} of the last 7 days`];
      if (fed != null) bits.push(`${fed} of those recorded days ticked food`);
      if (active != null) bits.push(`${active} of those recorded days ticked activity`);
      if (avg != null) bits.push(`averaging ${avg} kcal per recorded day`);
      if (streak != null) bits.push(`current fed streak ${streak} day(s)`);
      lines.push(`Last 7 days: ${bits.join(', ')}`);
    }
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

// ---------------------------------------------------------------------------
// Pet match: recommend which species and breed suits this household.
//
// The answers are a fixed set of keys with a fixed set of allowed values, so
// both ends validate against the same vocabulary. That keeps the prompt short
// and stops a crafted answer from smuggling instructions into the model.
const MATCH_QUESTIONS = {
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

const MATCH_ANSWER_LABELS = {
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

const MATCH_SYSTEM_PROMPT = `You help someone choose which species and breed of pet will genuinely suit their home and life. You are matching a living animal to a household, so honesty matters more than being agreeable.

You are given a fixed set of answers about the household: type of home, outdoor space, hours alone on a typical weekday, activity level, experience, who lives there, indoor space, noise tolerance, grooming effort, budget, time available, and the main reason they want a pet.

Respond with ONLY valid JSON, no markdown, no extra text, in exactly this shape:
{
  "headline": "one short sentence naming the overall direction, max 90 characters",
  "matches": [
    {
      "species": "one species from the list below",
      "breed": "a specific breed, or a short type such as 'any domestic shorthair'",
      "why": "2 or 3 short sentences tying the match to their actual answers",
      "effort": "a time and effort rating: low, medium or high",
      "cost": "a rough ongoing cost rating: low, medium or high",
      "watchOut": "the single most important thing to know before committing"
    }
  ],
  "runnerUp": "one or two sentences on the second best direction, if it is genuinely different",
  "considerations": ["2 to 4 things this household must weigh up before getting any pet"],
  "vetNote": "one short note on what a vet or shelter should check, or an empty string"
}

Rules:
- Suggest 2 to 3 matches, ordered best first. Never suggest more than 3.
- Only use species from this list: Dog, Cat, Rabbit, Bird, Hamster, Guinea Pig, Reptile, Fish, Horse.
- Only suggest a breed or type that genuinely exists for that species. Never invent a breed.
- Judge the animal against the household they described, especially hours alone, space, noise tolerance and who lives there.
- Be honest and sometimes discouraging. If their answers point to a poor fit for most pets, say so plainly in "considerations" rather than picking something anyway. Never flatter them to be agreeable.
- A pet is a 10 to 30 year commitment. Do not describe any animal as easy, low maintenance or a gift.
- Never invent figures, prices or guarantees. Keep cost as a rating, not a number.
- Do not push a specific breed or a purchase. Prefer rescue and shelter animals, and say so.
- Never suggest an animal that would be unsafe for the household, such as a venomous or constricting reptile for a home with young children, or any pet for someone who has said they cannot keep one.
- Keep the tone calm, plain and specific. No emoji, no hype, no scolding.`;

function validateMatch(body) {
  if (!body || typeof body !== 'object') return 'Request body must be an object';
  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'answers must be an object';

  const required = Object.keys(MATCH_QUESTIONS);
  for (const key of required) {
    const value = answers[key];
    if (typeof value !== 'string' || !MATCH_QUESTIONS[key].includes(value)) {
      return 'Invalid answer for "' + key + '"';
    }
  }

  const extra = Object.keys(answers).filter((k) => !MATCH_QUESTIONS[k]);
  if (extra.length) return 'Unexpected answer key: ' + extra[0];

  return null;
}

function buildMatchContext(body) {
  const answers = body.answers || {};
  const lines = [];
  for (const key of Object.keys(MATCH_QUESTIONS)) {
    const label = (MATCH_ANSWER_LABELS[key] || {})[answers[key]] || answers[key];
    if (label) lines.push(`${label}`);
  }
  return 'Household details:\n' + lines.map((l) => '- ' + l).join('\n');
}

const MATCH_EFFORT = ['low', 'medium', 'high'];
const MATCH_COST = ['low', 'medium', 'high'];

function normaliseMatch(result) {
  const source = result && typeof result === 'object' ? result : {};

  // The model may only speak about species it was offered, so anything else is
  // dropped rather than rendered.
  const list = (value, max) => (Array.isArray(value)
    ? value.map((item) => clampText(item, 260)).filter(Boolean).slice(0, max)
    : []);

  const matches = (Array.isArray(source.matches) ? source.matches : [])
    .slice(0, 3)
    .map((item) => ({
      species: SPECIES.includes(item && item.species) ? item.species : '',
      breed: clampText(item && item.breed, 80),
      why: clampText(item && item.why, 400),
      effort: MATCH_EFFORT.includes(item && item.effort) ? item.effort : 'medium',
      cost: MATCH_COST.includes(item && item.cost) ? item.cost : 'medium',
      watchOut: clampText(item && item.watchOut, 220)
    }))
    .filter((item) => item.species && item.breed);

  return {
    headline: clampText(source.headline, 140) || 'Here is what would suit your household best.',
    matches,
    runnerUp: clampText(source.runnerUp, 260),
    considerations: list(source.considerations, 4),
    vetNote: clampText(source.vetNote, 300)
  };
}

app.post('/api/pet-match', async (req, res) => {
  const validationError = validateMatch(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await callAI(req.body, false, {
      systemPrompt: MATCH_SYSTEM_PROMPT,
      userContent: buildMatchContext(req.body),
      temperature: 0.5,
      maxTokens: 1400
    });

    const match = normaliseMatch(result);
    // A reply with no usable species is a failure, not an empty result the user
    // should read as "nothing suits you".
    if (!match.matches.length) {
      return res.status(502).json({ error: 'The AI did not return a usable match. Please try again.' });
    }

    res.json(match);
  } catch (error) {
    console.error('Pet match error:', error.message);
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || 'Could not build a match. Please try again.',
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