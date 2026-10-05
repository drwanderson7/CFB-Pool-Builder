// /api/bets.js
// Reads and writes the Bet Tracker page's bets as one JSON blob in Redis, so the same bets show
// up on your laptop and your phone. Uses its own key, separate from the pool setup in
// /api/setup, so a problem with one can never overwrite the other. No npm packages needed —
// talks to the Upstash REST API with the KV_REST_API_URL / KV_REST_API_TOKEN environment
// variables Vercel adds automatically when you connect a Redis database.

const KEY = 'cfb-splash-pool-builder:bets';
const MAX_BETS = 5000;

async function kvGet(url, token, key) {
  const response = await fetch(url + '/get/' + encodeURIComponent(key), {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw new Error('KV GET failed: ' + response.status);
  const data = await response.json();
  return data.result || null;
}

async function kvSet(url, token, key, value) {
  const response = await fetch(url + '/set/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: value
  });
  if (!response.ok) throw new Error('KV SET failed: ' + response.status);
  return response.json();
}

module.exports = async (req, res) => {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Redis is not connected to this project yet (missing KV_REST_API_URL / KV_REST_API_TOKEN).' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const raw = await kvGet(url, token, KEY);
      res.status(200).json({ data: raw ? JSON.parse(raw) : null });
    } catch (err) {
      res.status(500).json({ error: 'Could not read the saved bets.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.bets)) {
      res.status(400).json({ error: 'Invalid bets payload.' });
      return;
    }
    if (payload.bets.length > MAX_BETS) {
      res.status(413).json({ error: 'Too many bets to save (limit ' + MAX_BETS + ').' });
      return;
    }
    try {
      await kvSet(url, token, KEY, JSON.stringify({ bets: payload.bets, deleted: payload.deleted || {}, settings: payload.settings || {} }));
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Could not save the bets.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
