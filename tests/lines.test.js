// Pool Builder > Check lines: compare saved spreads with ESPN's current lines.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, espnFeed, wait } = require('./helpers');

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const upcoming = (home, away, details) => ({ date: day(2), home: [home[0], home[1], 0], away: [away[0], away[1], 0], final: false, state: 'pre', odds: { details } });
const games = [
  upcoming(['Temple', 'TEM'], ['Navy', 'NAVY'], 'NAVY -4.5'),          // Temple saved +6.5, now +4.5 -> worse
  upcoming(['USC', 'USC'], ['Michigan State', 'MSU'], 'USC -8'),       // USC saved -9.5, now -8 -> better
  upcoming(['Army', 'ARMY'], ['Tulsa', 'TLSA'], 'ARMY -2.5'),          // unchanged
  { date: day(0), home: ['Rice', 'RICE', 7], away: ['UTSA', 'UTSA', 3], final: false, state: 'in', odds: { details: 'UTSA -3' } } // already started
];
const TEAMS = ['Temple +6.5', 'USC -9.5', 'Army -2.5', 'Rice +3', 'Purdue +14.5', 'Iowa -3', 'Utah -1'];

async function open(t, espn = { feed: espnFeed(games), calls: [] }) {
  const app = openApp({ espn });
  t.after(app.close);
  await wait(20);
  app.loadTeams(TEAMS);
  await wait(250); // quiet check after loading
  return app;
}
const badge = (app, name) => { const el = app.row(name).querySelector('.line-move'); return el ? el.className.replace('line-move ', '') + ' ' + el.textContent : ''; };

test('loading teams quietly checks lines and badges the ones that moved', async t => {
  const app = await open(t);
  assert.equal(badge(app, 'Temple +6.5'), 'worse \u25bc now +4.5');
  assert.equal(badge(app, 'USC -9.5'), 'better \u25b2 now -8');
  assert.equal(badge(app, 'Army -2.5'), '', 'unchanged line: no badge');
  assert.equal(badge(app, 'Rice +3'), '', 'started game: no badge');
  assert.doesNotMatch(app.status(), /moved/, 'the quiet check does not take over the status bar');
});

test('Check lines reports moved, started, and missing lines', async t => {
  const app = await open(t);
  app.$('#checkLinesBtn').click();
  await wait(200);
  const status = app.status();
  assert.match(status, /2 lines have moved/);
  assert.match(status, /Temple \+6\.5 \u2192 \+4\.5/);
  assert.match(status, /USC -9\.5 \u2192 -8/);
  assert.match(status, /Already started: Rice \+3/);
  assert.match(status, /No line found for 3 teams/);
});

test('badges follow picks into the entries after a build', async t => {
  const app = await open(t);
  app.setOverlap(7); // 7 teams, all shared
  app.build();
  const card = app.card(1, 'Temple +6.5') || app.card(2, 'Temple +6.5');
  assert.ok(card, 'Temple made an entry');
  assert.match(card.querySelector('.line-move').textContent, /now \+4\.5/);
});

test('Use current lines updates spreads, keeps tiers and locks, and Undo reverses it', async t => {
  const app = await open(t);
  app.setTier('Temple +6.5', 0);
  app.place('Temple +6.5', 3);
  app.$('#checkLinesBtn').click();
  await wait(200);
  app.$('#statusBox .status-action').click();
  assert.ok(app.row('Temple +4.5'), 'Temple renamed to the current line');
  assert.ok(app.row('USC -8'));
  assert.equal(app.tierOf('Temple +4.5'), 0, 'tier kept');
  assert.match(app.$('#teamInput').value, /Temple \+4\.5/);
  assert.equal(app.row('Temple +4.5').querySelector('.line-move'), null, 'no badge once it matches');
  assert.match(app.status(), /Spreads updated/);
  app.$('#undoBtn').click();
  assert.ok(app.row('Temple +6.5'), 'Undo brings back the old spread');
});

test('Check lines with no connection says so', async t => {
  const app = await open(t, null);
  app.$('#checkLinesBtn').click();
  await wait(100);
  assert.match(app.status(), /Couldn.t check lines/);
});

test('Check lines is off until a team has a spread', async t => {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  assert.equal(app.$('#checkLinesBtn').disabled, true);
  app.loadTeams(['Georgia', 'Alabama', 'Texas', 'Ohio State', 'Oregon', 'LSU', 'Utah']);
  await wait(50);
  assert.equal(app.$('#checkLinesBtn').disabled, true);
});

// ---------- Matching the right game ----------
const final = (date, home, away, details, hs, as) => ({ date, home: [home[0], home[1], hs], away: [away[0], away[1], as], state: 'post', odds: { details } });
const lastWeek = [
  final(day(-2), ['Temple', 'TEM'], ['Army', 'ARMY'], 'ARMY -6.5', 20, 24),
  final(day(-2), ['North Texas', 'UNT'], ['Rice', 'RICE'], 'RICE -1.5', 30, 27),
  final(day(-2), ['Hawaii', 'HAW'], ['UNLV', 'UNLV'], 'HAW -2.5', 31, 17),
  final(day(-2), ['USC', 'USC'], ['Oregon', 'ORE'], 'ORE -9.5', 21, 28)
];
const nextWeek = [
  upcoming(['Temple', 'TEM'], ['Navy', 'NAVY'], 'TEM -4.5'),            // a different game entirely
  upcoming(['North Texas', 'UNT'], ['Tulane', 'TULN'], 'UNT -27.5'),
  upcoming(['Hawaii', 'HAW'], ['Boise State', 'BSU'], 'BSU -20.5'),
  upcoming(['USC', 'USC'], ['Michigan State', 'MSU'], 'USC -8.5')
];
const LAST_WEEK_TEAMS = ['Temple +6.5', 'North Texas +1.5', 'Hawaii -2.5', 'USC +9.5', 'Purdue +14.5', 'Iowa -3', 'Utah -1'];

test('last week\u2019s slate is recognized as finished: no badges from next week\u2019s games', async t => {
  const app = openApp({ espn: { feed: espnFeed(lastWeek.concat(nextWeek)), calls: [] } });
  t.after(app.close);
  await wait(20);
  app.loadTeams(LAST_WEEK_TEAMS);
  await wait(250);
  assert.equal(app.$$('.line-move').length, 0, 'no misleading badges');
  app.$('#checkLinesBtn').click();
  await wait(200);
  assert.match(app.status(), /look finished/);
});

test('with last week\u2019s game also in view, an upcoming pick matches this week\u2019s game', async t => {
  const thisWeek = [upcoming(['Temple', 'TEM'], ['Navy', 'NAVY'], 'NAVY -5.5'), upcoming(['USC', 'USC'], ['Michigan State', 'MSU'], 'USC -8.5')];
  const app = openApp({ espn: { feed: espnFeed(lastWeek.concat(thisWeek)), calls: [] } });
  t.after(app.close);
  await wait(20);
  app.loadTeams(['Temple +6.5', 'USC -9.5', 'Purdue +14.5', 'Iowa -3', 'Utah -1', 'Rice +2', 'Army -3']);
  await wait(250);
  assert.equal(badge(app, 'Temple +6.5'), 'worse \u25bc now +5.5', 'compared with this week, not last week\u2019s +6.5 close');
  assert.equal(badge(app, 'USC -9.5'), 'better \u25b2 now -8.5');
});

test('a line more than 7 points off is flagged to check by hand, not badged', async t => {
  const app = openApp({ espn: { feed: espnFeed([upcoming(['Temple', 'TEM'], ['Navy', 'NAVY'], 'TEM -4.5'), upcoming(['USC', 'USC'], ['Michigan State', 'MSU'], 'USC -8.5')]), calls: [] } });
  t.after(app.close);
  await wait(20);
  app.loadTeams(['Temple +6.5', 'USC -9.5', 'Purdue +14.5', 'Iowa -3', 'Utah -1', 'Rice +2', 'Army -3']);
  await wait(250);
  assert.equal(badge(app, 'Temple +6.5'), '');
  app.$('#checkLinesBtn').click();
  await wait(200);
  assert.match(app.status(), /Check by hand .*Temple \+6\.5 vs -4\.5/);
  assert.match(app.status(), /USC -9\.5 \u2192 -8\.5/);
});
