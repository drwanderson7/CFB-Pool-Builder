// Saved weeks > Auto-grade from scores.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, espnFeed, wait } = require('./helpers');

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const savedAt = new Date(Date.now() - 4 * 864e5).toISOString(); // saved Tuesday-ish, games later in the week

const games = [
  { date: day(-2), home: ['Purdue', 'PUR', 20], away: ['Ohio State', 'OSU', 31] },   // Purdue +14.5 -> W
  { date: day(-2), home: ['Rice', 'RICE', 17], away: ['Navy', 'NAVY', 24] },          // Rice -3 -> L
  { date: day(-2), home: ['Texas', 'TEX', 30], away: ['Baylor', 'BAY', 23] },         // Texas -7 -> P
  { date: day(-1), home: ['Georgia', 'UGA', 35], away: ['Auburn', 'AUB', 10] },        // Georgia -6.5 -> W
  { date: day(0), home: ['Kansas State', 'KSU', 14], away: ['Iowa State', 'ISU', 7], final: false }
];

function week(overrides = {}) {
  return Object.assign({
    id: 'w1', savedAt, updatedAt: savedAt, overlap: 3,
    entry1: ['Purdue +14.5', 'Rice -3', 'Texas -7', 'Georgia -6.5', 'Kansas St PK', 'Alabama', 'Penn St -4.5'],
    entry2: ['Purdue +14.5', 'Rice -3', 'Texas -7', 'Georgia -6.5', 'Kansas St PK', 'Alabama', 'Penn St -4.5'],
    results: { 'Penn St -4.5': 'L' }, tiers: null
  }, overrides);
}
async function open(t, history, feed) {
  const app = openApp({ storage: { teams: [], overlap: 3, result: null, history }, espn: feed === undefined ? { feed: espnFeed(games), calls: [] } : feed });
  t.after(app.close);
  await wait(30);
  app.openHistory();
  return app;
}
const gradeOf = (app, name) => {
  const btn = app.gradeButtons(name)[0];
  return btn.className.replace('grade-btn', '').replace('grade-', '').trim();
};

test('Auto-grade from scores grades every pick with a spread and keeps existing grades', async t => {
  const app = await open(t, [week()]);
  app.$('#autoGradeBtn').click();
  await wait(400);
  assert.equal(gradeOf(app, 'Purdue +14.5'), 'W');
  assert.equal(gradeOf(app, 'Rice -3'), 'L');
  assert.equal(gradeOf(app, 'Texas -7'), 'P');
  assert.equal(gradeOf(app, 'Georgia -6.5'), 'W');
  assert.equal(gradeOf(app, 'Kansas St PK'), '', 'game not final yet');
  assert.equal(gradeOf(app, 'Penn St -4.5'), 'L', 'hand grade untouched');
  const note = app.$('#autoGradeNote').textContent;
  assert.match(note, /Graded 4 picks/);
  assert.match(note, /1 game isn.t final yet/);
  assert.match(note, /Alabama \(needs a spread/);
  const saved = JSON.parse(app.window.localStorage.getItem('cfb-splash-pool-builder-v1')).history[0];
  assert.equal(saved.results['Purdue +14.5'], 'W', 'grades are saved like hand grades');
});

test('weeks entered by hand are skipped and an all-graded history says so', async t => {
  const manual = { id: 'm1', savedAt, updatedAt: savedAt, overlap: 0, entry1: [], entry2: [], results: {}, tiers: null,
    manual: { week: 3, e1: [4, 3, 0], e2: [5, 2, 0], shared: [2, 1, 0], singles: [5, 3, 0] } };
  const graded = week({ results: Object.fromEntries(week().entry1.map(n => [n, 'W'])) });
  const app = await open(t, [graded, manual]);
  app.$('#autoGradeBtn').click();
  await wait(200);
  assert.match(app.$('#autoGradeNote').textContent, /already has a grade/);
});

test('no connection: says so and changes nothing', async t => {
  const app = await open(t, [week()], null);
  app.$('#autoGradeBtn').click();
  await wait(200);
  assert.match(app.$('#autoGradeNote').textContent, /reach ESPN/);
  assert.equal(gradeOf(app, 'Purdue +14.5'), '');
});
