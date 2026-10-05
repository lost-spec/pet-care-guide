// Round-trip the pet-match endpoint against a stub OpenAI-compatible server.
// This exercises the real server route: answer validation, prompt assembly,
// response normalisation, and the status codes public/match.js branches on.
const http = require('http');

const ANSWERS = {
  home: 'flat', outdoor: 'none', hoursAlone: '6-8', activity: 'low',
  experience: 'none', household: 'adults', space: 'small', noiseTolerance: 'low',
  grooming: 'low', budget: 'moderate', time: 'daily', reason: 'companionship'
};

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('ok    ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}

// A stub that speaks the OpenAI chat-completions shape callAI expects.
function stubOpenAI(content, store) {
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      store.body = JSON.parse(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: content } }] }));
    });
  });
}

// Returns the chosen port. Accepts an http.Server, or an express app whose
// listen() hands back the underlying server.
function listen(target) {
  if (target.address) {
    return new Promise((resolve) => {
      if (target.listening) { resolve(target.address().port); return; }
      target.listen(0, '127.0.0.1', () => resolve(target.address().port));
    });
  }
  const server = target.listen(0, '127.0.0.1');
  return new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
}

function parseMaybe(raw) {
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

function post(port, path, body) {
  return new Promise((resolve) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ port, host: '127.0.0.1', path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
    (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? parseMaybe(raw) : null }));
    });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    req.end(payload);
  });
}

function get(port, path) {
  return new Promise((resolve) => {
    http.get({ port, host: '127.0.0.1', path }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    }).on('error', (e) => resolve({ status: 0, body: e.message }));
  });
}

(async () => {
  const store = {};
  const good = {
    headline: 'A calm indoor cat suits a small flat best.',
    matches: [
      { species: 'Cat', breed: 'Domestic Shorthair', why: 'Independent and small.',
        effort: 'low', cost: 'medium', watchOut: 'Needs daily company.' },
      { species: 'Rabbit', breed: 'Dutch', why: 'Quiet and litter trainable.',
        effort: 'medium', cost: 'low', watchOut: 'Needs hay and space.' }
    ],
    runnerUp: 'A fish is lower effort if you want almost no daily handling.',
    considerations: ['Pets are a 10 to 30 year commitment.', 'Adopt from a shelter.'],
    vetNote: 'Ask the shelter about vaccinations.'
  };

  const upstream = stubOpenAI(JSON.stringify(good), store);
  const upstreamPort = await listen(upstream);

  process.env.LLM_BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`;
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'test-model';

  const app = require('../../server.js');
  const appPort = await listen(app);
  const call = (body) => post(appPort, '/api/pet-match', body);

  const reply = await call({ answers: ANSWERS });
  ok('a complete answer set returns 200', reply.status === 200,
    reply.status + ' ' + JSON.stringify(reply.body));
  ok('the model is given the household detail',
    /apartment|flat/i.test(store.body.messages[1].content), store.body.messages[1].content);
  ok('the system prompt forbids invented figures',
    /invent/i.test(store.body.messages[0].content));
  ok('the system prompt points at rescue and shelter animals',
    /rescue|shelter/i.test(store.body.messages[0].content));
  ok('the offered species list is sent to the model',
    /Guinea Pig/i.test(store.body.messages[0].content));
  ok('both matches come back', reply.body && reply.body.matches.length === 2,
    reply.body && String(reply.body.matches.length));
  ok('effort and cost stay ratings, never figures',
    reply.body.matches.every((m) => ['low', 'medium', 'high'].includes(m.effort)
      && ['low', 'medium', 'high'].includes(m.cost)));
  ok('the headline is passed through', /indoor cat/.test(reply.body.headline), reply.body.headline);
  ok('the runner up and vet note survive',
    Boolean(reply.body.runnerUp) && Boolean(reply.body.vetNote));
  ok('considerations come back as a list', reply.body.considerations.length === 2);

  const partial = await call({ answers: { home: 'flat' } });
  ok('a partial answer set is rejected with 400', partial.status === 400, partial.status);
  ok('the rejection names a question that was left out',
    /Invalid answer for "(outdoor|hoursAlone)"/.test(partial.body.error), partial.body.error);

  const badValue = await call({ answers: Object.assign({}, ANSWERS, { home: 'castle' }) });
  ok('a value outside the allowed list is rejected', badValue.status === 400, badValue.status);

  const extraKey = await call({ answers: Object.assign({}, ANSWERS, { surprise: 'yes' }) });
  ok('an unexpected answer key is rejected',
    extraKey.status === 400 && /surprise/.test(extraKey.body.error), extraKey.body.error);

  const notJson = await call('not json at all');
  ok('a malformed body is rejected with 400', notJson.status === 400, String(notJson.status));
  const empty = await call({});
  ok('a body with no answers is rejected', empty.status === 400, String(empty.status));
  const answersNotObject = await call({ answers: ['flat'] });
  ok('answers that are not an object are rejected', answersNotObject.status === 400,
    String(answersNotObject.status));

  // An invented species must be dropped rather than rendered as a suggestion.
  const rogue = stubOpenAI(JSON.stringify({
    headline: 'Nothing',
    matches: [{ species: 'Dragon', breed: 'Fire', why: 'x', effort: 'low', cost: 'low', watchOut: 'y' }]
  }), {});
  const roguePort = await listen(rogue);
  process.env.LLM_BASE_URL = `http://127.0.0.1:${roguePort}/v1`;
  const rogueReply = await call({ answers: ANSWERS });
  ok('an invented species is dropped and the reply fails with 502', rogueReply.status === 502,
    rogueReply.status + ' ' + JSON.stringify(rogueReply.body));
  process.env.LLM_BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`;

  const savedKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  const noKey = await call({ answers: ANSWERS });
  process.env.LLM_API_KEY = savedKey;
  ok('a missing key is reported as 503', noKey.status === 503, noKey.status);
  ok('the client can tell a missing key from other failures',
    noKey.body && noKey.body.code === 'ai_not_configured', noKey.body && noKey.body.code);

  const page = await get(appPort, '/match.html');
  ok('/match.html is served', page.status === 200 && /match-form/.test(page.body), String(page.status));
  ok('the match page is not indexed', /noindex/.test(page.body));

  const trackerPage = await get(appPort, '/tracker.html');
  ok('the tracker page links to the matcher', /match\.html/.test(trackerPage.body));

  const homePage = await get(appPort, '/');
  ok('the home page links to the matcher', /match\.html/.test(homePage.body));

  const client = await get(appPort, '/match.js');
  ok('the match script is served', client.status === 200 && /pet-match/.test(client.body));

  upstream.close();
  rogue.close();
  console.log('\n' + (fail ? fail + ' endpoint checks FAILED' : 'all ' + pass + ' endpoint checks passed'));
  process.exit(fail ? 1 : 0);
})();
