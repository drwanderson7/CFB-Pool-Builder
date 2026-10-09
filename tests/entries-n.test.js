// Pools with any number of picks per entry and any number of entries (not just 7 picks x 2 entries).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

function set(app, selector, value) {
  const el = app.$(selector);
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('change', { bubbles: true }));
}
// Opens the tool and shapes the pool: picks per entry, entries, shared-in-every-entry, and optionally the spread.
async function pool(t, { picks, entries, overlap, spread, teams = 24, opts } = {}) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(teams));
  if (picks) set(app, '#picksSelect', picks);
  if (entries) set(app, '#entriesSelect', entries);
  if (overlap !== undefined) set(app, '#overlapSelect', overlap);
  if (spread) set(app, '#spreadSelect', spread);
  return app;
}
const lineups = (app, n) => Array.from({ length: n }, (_, i) => app.entry(i + 1));
const exposure = lists => { const c = {}; lists.flat().forEach(name => { c[name] = (c[name] || 0) + 1; }); return c; };
const histogram = counts => Object.values(counts).reduce((h, n) => { h[n] = (h[n] || 0) + 1; return h; }, {});

// ---------- Building ----------

test('a 10-pick, 3-entry pool fills every entry with 10 different picks and puts exactly the shared group in all three', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  assert.equal(app.$$('.entry').length, 3);
  app.build();
  const lists = lineups(app, 3);
  lists.forEach(list => { assert.equal(list.length, 10); assert.equal(new Set(list).size, 10, 'no team twice in one entry'); });
  const counts = exposure(lists);
  assert.equal(Object.values(counts).filter(n => n === 3).length, 3, 'exactly 3 teams in every entry');
  assert.ok(Object.values(counts).every(n => n >= 1 && n <= 3));
  assert.match(app.status(), /All 3 entries have 10 picks, and exactly 3 teams are in every entry/);
  assert.equal(app.$$('.shared-marker').length, 9, 'the 3 shared teams are marked in each of the 3 entries');
  assert.ok(app.$$('.partial-marker').length > 0, 'picks in some but not all entries say how many');
  assert.match(app.$('.partial-marker').textContent, /^In 2 of 3$/);
  assert.equal(app.$('#entry1Count').textContent, '10 / 10');
});

test('the shared group leads each entry, then picks in the most entries', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  app.build();
  for (let n = 1; n <= 3; n++) {
    const counts = exposure(lineups(app, 3));
    const order = app.entry(n).map(name => counts[name]);
    assert.deepEqual(order, order.slice().sort((a, b) => b - a), 'sorted by how many entries each pick is in, most first');
  }
});

test('"most entries for a non-shared team" = 1 makes every non-shared team appear in just one entry', async t => {
  // 3 shared + 3 x 7 different picks = 24 teams
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3, spread: 1 });
  app.build();
  assert.deepEqual(histogram(exposure(lineups(app, 3))), { 1: 21, 3: 3 });
});

test('a higher spread lets the best teams repeat, and a smaller slate then works', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3, teams: 15, spread: 1 });
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.match(app.status(), /Not enough usable teams/);
  assert.match(app.status(), /needs at least 24 teams/);
  set(app, '#spreadSelect', 2);
  assert.equal(app.$('#buildBtn').disabled, false);
  app.build();
  const counts = exposure(lineups(app, 3));
  assert.ok(Object.values(counts).every(n => n <= 2 || n === 3));
  lineups(app, 3).forEach(list => assert.equal(list.length, 10));
});

test('the distinct-teams tile follows the number of entries and the spread', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  assert.equal(app.$('#totalSlots').textContent, '30');
  assert.equal(app.$('#uniqueNeeded').textContent, '14');      // 3 + ceil(21 / 2)
  assert.equal(app.$('#differentPicks').textContent, '7');
  set(app, '#spreadSelect', 1);
  assert.equal(app.$('#uniqueNeeded').textContent, '24');       // 3 + 21
  set(app, '#entriesSelect', 2);
  assert.equal(app.$('#uniqueNeeded').textContent, '17');       // 2 x 10 - 3, the old formula
  assert.equal(app.$('#differentPicks').textContent, '7 + 7');
});

test('tiers decide who gets the most entries: Lock = shared group, Strong = most entries, Meh = left out', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3, teams: 24 });
  const names = teamNames(24);
  names.slice(0, 3).forEach(n => app.setTier(n, 0));
  names.slice(3, 10).forEach(n => app.setTier(n, 1));
  names.slice(18).forEach(n => app.setTier(n, 3));
  for (let round = 0; round < 6; round++) {
    app.build();
    const counts = exposure(lineups(app, 3));
    names.slice(0, 3).forEach(n => assert.equal(counts[n], 3, n + ' is a Lock'));
    names.slice(3, 10).forEach(n => assert.equal(counts[n], 2, n + ' is Strong'));
    names.slice(18).forEach(n => assert.equal(counts[n], undefined, n + ' is Meh and left out'));
  }
});

test('Another valid build changes which entries a team lands in', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  const seen = new Set();
  for (let i = 0; i < 6; i++) { app.build(); seen.add(JSON.stringify(lineups(app, 3))); }
  assert.ok(seen.size > 1);
});

test('placements work for every entry: S3 fixes a team to Entry 3, the lock puts it in all entries', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  assert.deepEqual(app.$$('.place-btn').slice(0, 4).map(b => b.textContent), ['S1', 'S2', 'S3', '🔒']);
  app.place('Team5', 4);   // S3
  app.place('Team6', 7);   // lock in all
  app.build();
  assert.ok(app.entry(3).includes('Team5'));
  assert.ok(!app.entry(1).includes('Team5') && !app.entry(2).includes('Team5'));
  [1, 2, 3].forEach(n => assert.ok(app.entry(n).includes('Team6')));
  assert.match(app.row('Team5').querySelector('.row-summary').textContent, /In Entry 3/);
  assert.match(app.row('Team6').querySelector('.row-summary').textContent, /Locked in all 3/);
  // unlock from the pick card
  app.card(1, 'Team6').querySelector('[data-action="unlock"]').click();
  assert.equal(app.row('Team6').querySelector('.place-btn.both').classList.contains('active'), false);
});

test('locking more teams in every entry than the shared count allows is refused with the reason', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 1 });
  app.place('Team0', 7);
  app.place('Team1', 7);
  assert.match(app.status(), /Too many teams locked in both/);
  assert.match(app.status(), /2 teams are locked in all 3 entries, above your shared-pick target of 1/);
  assert.equal(app.row('Team1').querySelector('.place-btn.both.active'), null, 'the second lock was not applied');
  assert.ok(app.row('Team0').querySelector('.place-btn.both.active'));
});

test('Move to puts a one-entry pick in another entry, with a button for each other entry', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3, spread: 1 });
  app.build();
  const lone = app.entry(1).find(name => !app.entry(2).includes(name) && !app.entry(3).includes(name));
  const moves = [...app.card(1, lone).querySelectorAll('[data-action="move"]')];
  assert.deepEqual(moves.map(b => b.dataset.targetEntry), ['2', '3']);
  moves[1].click();
  assert.ok(app.entry(3).includes(lone));
  assert.ok(!app.entry(1).includes(lone));
  lineups(app, 3).forEach(list => assert.equal(list.length, 10));
});

test('Min and Max run from 0 to the number of entries; Min = all entries forces a team into every entry', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  assert.equal(app.row('Team7').querySelectorAll('.exposure-btn[data-field="min"]').length, 4);
  app.setExposure('Team7', 'min', 3);
  app.build();
  [1, 2, 3].forEach(n => assert.ok(app.entry(n).includes('Team7')));
  app.setExposure('Team8', 'max', 0);
  app.build();
  [1, 2, 3].forEach(n => assert.ok(!app.entry(n).includes('Team8')));
  assert.ok(app.$('#benchedList').textContent.includes('Team8'));
});

test('Clear locks on one entry releases only that entry\'s placements', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  app.place('Team1', 1);
  app.place('Team2', 2);
  app.place('Team3', 7);
  app.$('#clearEntry1').click();
  assert.equal(app.row('Team1').querySelector('.place-btn.active'), null, 'Team1 released');
  assert.ok(app.row('Team2').querySelector('.place-btn.active'), 'Team2 still in Entry 2');
  assert.match(app.row('Team3').querySelector('.row-summary').textContent, /In entries 2 \+ 3/);
});

test('Copy entry copies that entry and the status counts the picks', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  app.build();
  app.$('#copyEntry3').click();
  await wait(10);
  const lines = app.window.__clipboard.split('\n');
  assert.equal(lines[0], 'Splash Entry 3');
  assert.equal(lines.length, 11);
  assert.match(app.status(), /The ten picks are on your clipboard/);
});

test('4 to 6 entries build too (7 picks x 6 entries, 1 team in all six)', async t => {
  const app = await pool(t, { picks: 7, entries: 6, overlap: 1, teams: 40 });
  assert.ok(app.$('#candidatesCard').classList.contains('compact-always'), '4+ entries use the one-line rows');
  app.build();
  const lists = lineups(app, 6);
  lists.forEach(list => { assert.equal(list.length, 7); assert.equal(new Set(list).size, 7); });
  assert.equal(Object.values(exposure(lists)).filter(n => n === 6).length, 1);
  assert.equal(app.$$('.entry').length, 6);
});

test('a team locked to an entry still builds when other entries have no locks (pinned + free mix)', async t => {
  const app = await pool(t, { picks: 8, entries: 4, overlap: 0, teams: 30 });
  for (let i = 0; i < 8; i++) app.place('Team' + i, 1);   // fill entry 1 with fixed picks
  app.place('Team8', 8);                                    // and one fixed in entry 4
  app.build();
  const lists = lineups(app, 4);
  lists.forEach(list => assert.equal(list.length, 8));
  assert.deepEqual(lists[0].slice().sort(), teamNames(8).sort(), 'entry 1 is exactly the eight fixed picks');
  assert.ok(lists[3].includes('Team8'));
});

// ---------- Changing the pool's shape ----------

test('changing picks or entries keeps the teams, clears the build, and Undo brings it all back', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  app.setTier('Team2', 0);
  app.build();
  const before = JSON.stringify(lineups(app, 3));
  set(app, '#entriesSelect', 4);
  assert.equal(app.$$('.entry').length, 4);
  assert.equal(app.entry(1).length, 0, 'the old build is gone');
  assert.equal(app.$$('.team-row').length, 24, 'the teams stay');
  assert.equal(app.tierOf('Team2'), 0, 'and so do their tiers');
  assert.equal(app.$('#buildBtn').textContent, 'Build 4 entries');
  assert.match(app.status(), /Pool updated/);
  app.$('#undoBtn').click();
  assert.equal(app.$$('.entry').length, 3);
  assert.equal(JSON.stringify(lineups(app, 3)), before);
  assert.equal(app.$('#entriesSelect').value, '3');
});

test('going from 3 entries back to 2 fits placements and Max to the smaller pool', async t => {
  const app = await pool(t, { picks: 7, entries: 3, overlap: 2 });
  app.place('Team1', 4);   // S3
  app.place('Team2', 7);   // in all three
  set(app, '#entriesSelect', 2);
  assert.equal(app.row('Team1').querySelector('.place-btn.active'), null, 'Entry 3 no longer exists');
  assert.ok(app.row('Team2').querySelector('.place-btn.both.active'), 'locked in all becomes locked in both');
  assert.equal(app.row('Team2').querySelectorAll('.exposure-btn[data-field="max"]').length, 3);
  assert.equal(app.row('Team2').querySelector('.exposure-btn[data-field="max"].active').dataset.value, '2');
  app.build();
  assert.equal(app.entry(1).length, 7);
  assert.equal(app.entry(2).length, 7);
});

test('the shared menu always runs from 0 to the picks per entry, and shrinks with it', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 9 });
  assert.equal(app.$$('#overlapSelect option').length, 11);
  set(app, '#picksSelect', 5);
  assert.equal(app.$$('#overlapSelect option').length, 6);
  assert.equal(app.$('#overlapSelect').value, '5', 'the shared count is held to the new picks per entry');
});

test('subtitle, build button, and setup summary describe the pool', async t => {
  const app = await pool(t, { picks: 10, entries: 3, overlap: 3 });
  assert.match(app.$('#poolSubtitle').textContent, /^Three 10-pick Splash entries/);
  assert.equal(app.$('#buildBtn').textContent, 'Build 3 entries');
  app.$('#setupHideBtn').click();
  assert.equal(app.$('#setupSummaryText').textContent, '24 teams · 10 picks × 3 entries · 3 shared picks');
});

test('the 2-entry, 7-pick pool is unchanged: Both entries wording, Move to N, Unlock both', async t => {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(14));
  app.place('Team0', 3);
  app.build();
  assert.match(app.status(), /Both entries have 7 picks and share exactly 3/);
  assert.equal(app.$('#spreadField').classList.contains('hidden'), true);
  assert.equal(app.card(1, 'Team0').querySelector('[data-action="unlock"]').textContent, 'Unlock both');
  const lone = app.entry(1).find(n => !app.entry(2).includes(n));
  assert.equal(app.card(1, lone).querySelector('[data-action="move"]').textContent, 'Move to 2');
});

test('a saved setup from before pools existed (no picks, entries, or name) opens as the Pick 7 pool', async t => {
  const legacy = { teams: teamNames(14).map((name, i) => ({ id: 'x' + i, name, min: 0, max: 2, fixedMask: 0, tier: 2 })), overlap: 4, result: null, history: [] };
  const app = openApp({ storage: legacy });
  t.after(app.close);
  await wait(20);
  assert.equal(app.$('#picksSelect').value, '7');
  assert.equal(app.$('#entriesSelect').value, '2');
  assert.equal(app.$('#overlapSelect').value, '4');
  assert.equal(app.$('.pool-tab.active').textContent.trim().startsWith('Pick 7'), true);
  app.build();
  assert.equal(app.entry(1).length, 7);
});
