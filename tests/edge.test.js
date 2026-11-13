// Pools that post their own lines: edge vs market, key numbers, tier hints, Sort by edge,
// same-game warnings, game context, your record per team, and records by pick type.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, espnFeed, wait } = require('./helpers');

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const upcoming = (home, away, details) => ({ date: day(2), home: [home[0], home[1], 0], away: [away[0], away[1], 0], final: false, state: 'pre', odds: { details } });
const games = [
  upcoming(['Temple', 'TEM'], ['Navy', 'NAVY'], 'NAVY -4.5'),        // pool Temple +6.5 -> +2 edge; Navy -3 -> +1.5
  upcoming(['USC', 'USC'], ['Michigan State', 'MSU'], 'USC -8'),     // pool USC -9.5 -> -1.5 edge
  upcoming(['Army', 'ARMY'], ['Tulsa', 'TLSA'], 'ARMY -3.5'),        // pool Army -2.5 -> +1, gets 3
  upcoming(['Iowa', 'IOWA'], ['Purdue', 'PUR'], 'IOWA -4.5'),        // pool Purdue +7.5 -> +3, gets 7 -> hint Strong
  upcoming(['Utah', 'UTAH'], ['Rice', 'RICE'], 'UTAH -10')           // pool Utah -13.5 -> -3.5 -> hint Meh
];
const TEAMS = ['Temple +6.5', 'USC -9.5', 'Army -2.5', 'Purdue +7.5', 'Utah -13.5', 'Navy -3', 'Alpha +1', 'Beta +2', 'Gamma +3'];

async function open(t, teams = TEAMS, opts = {}) {
  const app = openApp(Object.assign({ espn: { feed: espnFeed(games), calls: [] } }, opts));
  t.after(app.close);
  await wait(20);
  app.loadTeams(teams);
  await wait(300);
  return app;
}
const edge = (app, name) => { const el = app.row(name).querySelector('.line-move'); return el ? el.className.replace('line-move edge ', '') + ' ' + el.textContent : ''; };
const hint = (app, name) => app.row(name).querySelector('.tier-hint');

test('a new pool reads its lines as posted by the pool', async t => {
  const app = await open(t, ['Alpha +1']);
  assert.equal(app.$('#linesSelect').value, 'pool');
});

test('each team shows its edge vs the market, with key numbers', async t => {
  const app = await open(t);
  assert.equal(edge(app, 'Temple +6.5'), 'better ▲ +2 vs +4.5');
  assert.equal(edge(app, 'USC -9.5'), 'worse ▼ -1.5 vs -8');
  assert.equal(edge(app, 'Army -2.5'), 'better key ▲ +1 vs -3.5 · gets 3');
  assert.equal(edge(app, 'Purdue +7.5'), 'better key ▲ +3 vs +4.5 · gets 7');
  assert.equal(edge(app, 'Utah -13.5'), 'worse ▼ -3.5 vs -10', '10 to 13.5 holds no key number');
  assert.equal(edge(app, 'Alpha +1'), '', 'no game found: no badge');
  assert.match(app.row('Temple +6.5').querySelector('.line-move').title, /Pool \+6\.5, market \+4\.5: 2 points better than the market/);
  assert.equal(app.$$('.line-move').filter(b => /now/.test(b.textContent)).length, 0, 'no "moved" badges in a pool-lines pool');
});

test('a worse number that gives up a key number says so', async t => {
  const app = await open(t, ['Tulsa +2.5', 'Alpha +1']);
  assert.equal(edge(app, 'Tulsa +2.5'), 'worse key \u25bc -1 vs +3.5 \u00b7 loses 3');
});

test('Check lines lists the edges and does not offer to rewrite the pool’s numbers', async t => {
  const app = await open(t);
  app.$('#checkLinesBtn').click();
  await wait(200);
  const status = app.status();
  assert.match(status, /^Edge vs market/);
  assert.match(status, /Better than market: Purdue \+3 \(gets 7\), Temple \+2, Army \+1 \(gets 3\), Navy \+1\.5\./);
  assert.match(status, /Worse than market: Utah -3\.5, USC -1\.5/);
  assert.equal(app.$('#statusBox [data-fix="lines"]'), null);
});

test('tier hints only suggest; tapping one sets the tier and Undo reverses it', async t => {
  const app = await open(t);
  assert.equal(hint(app, 'Purdue +7.5').textContent, 'Try Strong');
  assert.equal(hint(app, 'Utah -13.5').textContent, 'Try Meh');
  assert.equal(hint(app, 'Temple +6.5'), null, '+2 alone is not enough for a hint');
  assert.equal(app.tierOf('Purdue +7.5'), 2, 'nothing changes by itself');
  hint(app, 'Purdue +7.5').click();
  assert.equal(app.tierOf('Purdue +7.5'), 1);
  assert.equal(hint(app, 'Purdue +7.5'), null, 'no hint once it is Strong');
  app.$('#undoBtn').click();
  assert.equal(app.tierOf('Purdue +7.5'), 2);
});

test('Sort by edge puts the best numbers first inside each tier, and keeps tiers apart', async t => {
  const app = await open(t);
  app.setTier('Navy -3', 0);
  const sortBtn = app.$('#sortEdgeBtn');
  assert.ok(!sortBtn.classList.contains('hidden'));
  sortBtn.click();
  const lean = app.candidateOrder().filter(name => app.tierOf(name) === 2);
  assert.deepEqual(lean.slice(0, 5), ['Purdue +7.5', 'Temple +6.5', 'Army -2.5', 'USC -9.5', 'Utah -13.5']);
  assert.deepEqual(lean.slice(5), ['Alpha +1', 'Beta +2', 'Gamma +3'], 'teams without a line keep their order, after');
  assert.equal(app.candidateOrder()[0], 'Navy -3', 'the Lock stays in its own tier');
  app.$('#undoBtn').click();
  assert.equal(app.candidateOrder().filter(name => app.tierOf(name) === 2)[0], 'Temple +6.5');
});

test('market-line pools keep the old behavior: moved lines and Use current lines', async t => {
  const app = await open(t);
  const lines = app.$('#linesSelect');
  lines.value = 'market';
  lines.dispatchEvent(new app.window.Event('change'));
  assert.match(app.row('Temple +6.5').querySelector('.line-move').textContent, /now \+4\.5/);
  assert.ok(app.$('#sortEdgeBtn').classList.contains('hidden'));
  assert.equal(hint(app, 'Purdue +7.5'), null);
});

test('rows show the opponent and kickoff, and note when the other side is also listed', async t => {
  const app = await open(t);
  const ctx = app.row('Temple +6.5').querySelector('.line-ctx').textContent;
  assert.match(ctx, /^vs Navy · /);
  assert.match(app.row('Navy -3').querySelector('.line-ctx').textContent, /^@ Temple/);
  assert.match(app.row('Temple +6.5').querySelector('.same-game').textContent, /Other side: Navy -3/);
  assert.equal(app.row('USC -9.5').querySelector('.same-game'), null);
});

test('a build keeps both sides of one game out of the same entry', async t => {
  // 9 teams, 7 picks, 5 shared -> every team lands somewhere; Temple and Navy must split entries
  const app = await open(t);
  app.setOverlap(5);
  for (let i = 0; i < 8; i++) {
    app.build();
    [1, 2].forEach(n => {
      const list = app.entry(n);
      assert.ok(!(list.includes('Temple +6.5') && list.includes('Navy -3')), 'Entry ' + n + ' holds both sides');
    });
  }
});

test('when locks force both sides into one entry, the build warns and the cards are flagged', async t => {
  const app = await open(t);
  app.setOverlap(5);
  app.place('Temple +6.5', 1);
  app.place('Navy -3', 1);
  app.build();
  assert.match(app.status(), /Heads up: Entry 1: Navy -3 \/ Temple \+6\.5/);
  assert.match(app.card(1, 'Temple +6.5').querySelector('.same-game').textContent, /Same game as Navy -3/);
});

test('each candidate shows your record on that team in this pool', async t => {
  const saved = '2026-09-01T12:00:00.000Z';
  const week = (id, lineups, results) => ({ id, savedAt: saved, updatedAt: saved, overlap: 3, picks: 7, lineups, entry1: lineups[0], entry2: lineups[1], results, tiers: {}, manual: null });
  const seven = ['Temple +3', 'A1 +1', 'A2 +1', 'A3 +1', 'A4 +1', 'A5 +1', 'A6 +1'];
  const storage = { v: 2, pools: [{ id: 'main', name: 'Pick 7', picks: 7, entries: 2, spread: 1, overlap: 3, teams: [], result: null,
    history: [week('w1', [seven, seven], { 'Temple +3': 'W' }), week('w2', [seven.map(n => n.replace('+3', '-2')), seven.map(n => n.replace('+3', '-2'))], { 'Temple -2': 'L' }),
      week('w3', [seven.map(n => n.replace('+3', '+10')), seven.map(n => n.replace('+3', '+10'))], { 'Temple +10': 'W' })] }], deleted: {} };
  const app = await open(t, TEAMS, { storage });
  assert.equal(app.row('Temple +6.5').querySelector('.team-record').textContent, 'You 2-1');
  assert.equal(app.row('USC -9.5').querySelector('.team-record'), null);
});

test('Saved weeks shows records by pick type: favorites, underdogs, and spread size', async t => {
  const app = await open(t);
  app.setOverlap(5);
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  app.grade('Purdue +7.5');           // W, dog, 7.5-14
  app.grade('Utah -13.5', 2);         // L, fav, 7.5-14
  const chips = app.$$('.summary-types .type-chip').map(c => c.textContent);
  const has = (re) => chips.some(c => re.test(c));
  if (app.entry(1).concat(app.entry(2)).includes('Purdue +7.5')) assert.ok(has(/^Underdogs 1-0/));
  if (app.entry(1).concat(app.entry(2)).includes('Utah -13.5')) assert.ok(has(/^Favorites 0-1/));
  assert.ok(chips.length > 0);
});

test('the lines setting is saved with the pool and synced', async t => {
  const app = await open(t, ['Alpha +1']);
  const lines = app.$('#linesSelect');
  lines.value = 'market';
  lines.dispatchEvent(new app.window.Event('change'));
  const stored = JSON.parse(app.window.localStorage.getItem('cfb-splash-pool-builder-v1'));
  assert.equal(stored.pools[0].lines, 'market');
  app.$('#undoBtn').click();
  assert.equal(app.$('#linesSelect').value, 'pool');
});

test('Ctrl/Cmd+Enter builds and Ctrl/Cmd+S saves the week', async t => {
  const app = await open(t);
  app.setOverlap(5);
  const key = (k, extra = {}) => app.doc.body.dispatchEvent(new app.window.KeyboardEvent('keydown', Object.assign({ key: k, ctrlKey: true, bubbles: true, cancelable: true }, extra)));
  key('Enter');
  assert.equal(app.entry(1).length, 7);
  key('s');
  app.openHistory();
  assert.equal(app.$$('.history-entry').length, 1);
  app.$('#historyCloseBtn').click();
  const before = app.entry(1).join();
  app.$('#teamInput').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
  assert.equal(app.entry(1).join(), before, 'not while typing in the team list');
});
