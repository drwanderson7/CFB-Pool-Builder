// Shared helpers for the CFB Splash Pool Builder tests.
// Each test opens the real ../index.html in a simulated browser (jsdom), with a fake /api/setup
// backend standing in for Redis, then drives the page the way you would: typing teams, clicking
// buttons, changing dropdowns.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const STORAGE_KEY = 'cfb-splash-pool-builder-v1';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const teamNames = count => Array.from({ length: count }, (_, i) => 'Team' + i);

// Fake sync server. mode: 'up' | 'offline' | '404' | 'notconnected' | '500'
// data = the pool setup (/api/setup); bets = the Bet Tracker store (/api/bets).
function createBackend() {
  return { data: null, bets: null, mode: 'up' };
}

// Fake ESPN scoreboard. games: [{ date: 'YYYY-MM-DD', home: [name, abbr, score], away: [...], final }]
// Each team name also serves as its location/shortDisplayName, like ESPN's feed.
function espnFeed(games) {
  const team = ([name, abbr]) => ({ location: name, shortDisplayName: name, displayName: name + ' Team', name: 'Team', abbreviation: abbr });
  return url => {
    const m = String(url).match(/dates=(\d{8})(?:-(\d{8}))?/);
    const group = (String(url).match(/groups=(\d+)/) || [])[1];
    const from = m[1], to = m[2] || m[1];
    return games
      .filter(g => (g.group || '80') === (group || '80'))
      .filter(g => { const d = g.date.replace(/-/g, ''); return d >= from && d <= to; })
      .map(g => ({
        date: g.date + 'T19:00Z',
        status: { type: { completed: g.final !== false, name: g.status || (g.final === false ? 'STATUS_SCHEDULED' : 'STATUS_FINAL'), description: g.description || '' } },
        competitions: [{ competitors: [
          { homeAway: 'home', team: team(g.home), score: String(g.home[2]) },
          { homeAway: 'away', team: team(g.away), score: String(g.away[2]) }
        ] }]
      }));
  };
}

function mockFetch(backend, espn) {
  return (url, opts) => new Promise((resolve, reject) => setTimeout(() => {
    url = String(url);
    if (url.includes('site.api.espn.com')) {
      if (!espn) return reject(new TypeError('network down'));
      if (espn.calls) espn.calls.push(url);
      return resolve({ ok: true, status: 200, json: async () => ({ events: espn.feed(url) }) });
    }
    const field = url.includes('/api/bets') ? 'bets' : 'data';
    if (!backend || backend.mode === 'offline') return reject(new Error('network down'));
    if (backend.mode === '404') return resolve({ ok: false, status: 404, json: async () => ({}) });
    if (backend.mode === 'notconnected') return resolve({ ok: false, status: 500, json: async () => ({ error: 'Redis is not connected to this project yet.' }) });
    if (backend.mode === '500') return resolve({ ok: false, status: 500, json: async () => ({ error: 'Could not save the setup.' }) });
    if (opts && opts.method === 'POST') {
      backend[field] = JSON.parse(opts.body);
      return resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    }
    resolve({ ok: true, status: 200, json: async () => ({ data: backend[field] }) });
  }, 5));
}

// Opens a fresh "device". Pass the same backend to two apps to simulate laptop + phone.
// backend: null means no sync server at all (e.g. opened as a local file).
function openApp({ backend = null, confirm = true, storage = null, espn = null, bets = null, url = 'https://pool.test/', now = null } = {}) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url,
    beforeParse(w) {
      if (now) { const RealDate = w.Date; const fixed = new RealDate(now).getTime(); w.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; }
      w.fetch = mockFetch(backend, espn);
      w.confirm = typeof confirm === 'function' ? confirm : () => confirm;
      w.__clipboard = '';
      Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: async text => { w.__clipboard = text; } },
        configurable: true
      });
      if (storage) w.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      if (bets) w.localStorage.setItem('cfb-pool-bets-v1', JSON.stringify(bets));
    }
  });
  return makeApi(dom);
}

function makeApi(dom) {
  const w = dom.window;
  const doc = w.document;
  const $ = selector => doc.querySelector(selector);
  const $$ = selector => Array.from(doc.querySelectorAll(selector));

  const app = {
    window: w,
    doc,
    $,
    $$,
    close: () => w.close(), // stops the page's timers so the test process can exit

    status: () => $('#statusBox').textContent.replace(/\s+/g, ' ').trim(),
    syncLabel: () => $('#syncStatus').textContent,
    syncKind: () => $('#syncStatus').className.replace('sync-pill ', ''),

    loadTeams(names) {
      $('#teamInput').value = names.join('\n');
      $('#loadTeamsBtn').click();
    },
    setOverlap(n) {
      const select = $('#overlapSelect');
      select.value = String(n);
      select.dispatchEvent(new w.Event('change'));
    },
    build: () => $('#buildBtn').click(),

    // Candidate list (rows are found by full team name, which is the row's title)
    row: name => $$('.team-row').find(r => r.querySelector('.team-name').title === name),
    candidateOrder: () => $$('.team-row').map(r => r.querySelector('.team-name').title),
    dividers: () => $$('.tier-divider').map(d => d.textContent),
    tierOf: name => Number(app.row(name).querySelector('.tier-select').value),
    setTier(name, tier) {
      const select = app.row(name).querySelector('.tier-select');
      select.value = String(tier);
      select.dispatchEvent(new w.Event('change', { bubbles: true }));
    },
    setExposure(name, field, value) {
      app.row(name).querySelector('.exposure-btn[data-field="' + field + '"][data-value="' + value + '"]').click();
    },
    place(name, mask) {
      app.row(name).querySelector('.place-btn[data-mask="' + mask + '"]').click();
    },
    arrow(name, dir) {
      return app.row(name).querySelector('.rank-btn[data-dir="' + dir + '"]');
    },
    dragOnto(draggedName, targetName, before = true) {
      const start = new w.Event('dragstart', { bubbles: true, cancelable: true });
      start.dataTransfer = { setData() {}, effectAllowed: null };
      app.row(draggedName).dispatchEvent(start);
      const target = app.row(targetName);
      target.getBoundingClientRect = () => ({ top: 100, height: 40 });
      const drop = new w.Event('drop', { bubbles: true, cancelable: true });
      drop.dataTransfer = { getData: () => '' };
      Object.defineProperty(drop, 'clientY', { value: before ? 105 : 135 });
      target.dispatchEvent(drop);
      (app.row(draggedName) || doc.body).dispatchEvent(new w.Event('dragend', { bubbles: true }));
    },

    // Entries
    entry: n => $$('#entry' + n + 'Zone .pick-card').map(c => c.querySelector('.pick-name').title),
    shared: () => { const two = new Set(app.entry(2)); return app.entry(1).filter(n => two.has(n)); },
    card: (n, name) => $$('#entry' + n + 'Zone .pick-card').find(c => c.querySelector('.pick-name').title === name),

    // Saved weeks
    openHistory: () => $('#historyBtn').click(),
    gradeButtons: name => $$('.grade-btn').filter(b => b.dataset.team === name),
    grade(name, taps = 1) { for (let i = 0; i < taps; i++) app.gradeButtons(name)[0].click(); },

    // Simulates switching back to this tab (triggers a pull from the server)
    becomeVisible() {
      Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true });
      doc.dispatchEvent(new w.Event('visibilitychange'));
    },
    keyUndo(target) {
      (target || doc.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    }
  };
  return app;
}

// Waits long enough for a debounced push (600ms) plus the fake network round trip.
const SYNC_WAIT = 800;

module.exports = { openApp, createBackend, espnFeed, teamNames, wait, SYNC_WAIT, STORAGE_KEY };
