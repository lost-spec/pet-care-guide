require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a pet care expert. Given a pet type and breed, respond with ONLY valid JSON, no markdown, no extra text, in exactly this shape:
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
  "warnings": [string]
}
Give 4-6 keyPoints per section. Labels must be short (1-3 words).
If the breed doesn't exist or isn't a real pet, return { "error": "Unknown breed" }.`;

const NAME_REGEX = /^[A-Za-z\s-]{1,50}$/;

function validateInput(petType, breed) {
  if (!petType || !breed) {
    return 'Both petType and breed are required';
  }
  if (typeof petType !== 'string' || typeof breed !== 'string') {
    return 'petType and breed must be strings';
  }
  if (!NAME_REGEX.test(petType) || !NAME_REGEX.test(breed)) {
    return 'Only letters, spaces, and hyphens allowed (max 50 characters)';
  }
  return null;
}

async function callAI(petType, breed, retry = false) {
  const baseUrl = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'google/gemma-4-26b-a4b-it:free';
  const extraHeaders = process.env.LLM_EXTRA_HEADERS ? JSON.parse(process.env.LLM_EXTRA_HEADERS) : {};

  if (!apiKey) {
    throw new Error('LLM_API_KEY environment variable is not set. Add it in Vercel Settings → Environment Variables.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...extraHeaders
  };

  // OpenRouter recommended headers
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = process.env.HTTP_REFERER || 'https://pet-care-guide.vercel.app';
    headers['X-Title'] = process.env.X_TITLE || 'Pet Care Guide';
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Pet type: ${petType}, Breed: ${breed}` }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });
  } catch (fetchError) {
    const details = [
      fetchError.message,
      fetchError.code ? `code: ${fetchError.code}` : '',
      fetchError.cause ? `cause: ${fetchError.cause}` : '',
      fetchError.stack ? `stack: ${fetchError.stack}` : ''
    ].filter(Boolean).join(' | ');
    throw new Error(`Network error for ${baseUrl}/chat/completions: ${details}`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API error: ${response.status} ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  
  if (!content) {
    throw new Error('Empty response from AI');
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    if (retry) {
      throw new Error('Failed to parse AI response after retry');
    }
    return callAI(petType, breed, true);
  }
}

app.post('/api/pet-info', async (req, res) => {
  const { petType, breed } = req.body;

  const validationError = validateInput(petType, breed);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await callAI(petType, breed);
    
    if (result.error === 'Unknown breed') {
      return res.status(404).json({ error: 'Unknown breed' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to get pet care info. Please try again.' });
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