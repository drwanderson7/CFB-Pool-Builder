// Saved weeks, grading, season records and hand-entered weeks for pools with 3+ entries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

function set(app, selector, value) {
  const el = app.$(selector);
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('change', { bubbles: true }));
}
function typeInto(app, id, value) {
  const el = app.$('#' + id);
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}
const fillRow = (app, row, rec) => ['W', 'L', 'P'].forEach((col, i) => typeInto(app, `past-${row}-${col}`, rec[i]));
const readRow = (app, row) => ['W', 'L', 'P'].map(col => app.$(`#past-${row}-${col}`).value);
function tile(app, label) {
  const cell = app.$$('.summary-stats > div').find(d => d.querySelector('span').textContent === label);
  return cell && cell.querySelector('strong').textContent;
}
const tileLabels = app => app.$$('.summary-stats > div').map(d => d.querySelector('span').textContent);

async function threeEntryPool(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(24));
  set(app, '#picksSelect', 10);
  set(app, '#entriesSelect', 3);
  set(app, '#overlapSelect', 3);
  return app;
}

test('saving a 3-entry week keeps all three lineups, and grading counts each pick once', async t => {
  const app = await threeEntryPool(t);
  app.build();
  const lists = [1, 2, 3].map(n => app.entry(n));
  app.$('#saveWeekBtn').click();
  app.openHistory();
  const card = app.$('.history-entry');
  assert.equal(card.querySelectorAll('.history-columns > div').length, 3);
  assert.equal(card.querySelector('.history-head span').textContent, '3 in all 3');
  assert.deepEqual([...card.querySelectorAll('h4')].map(h => h.textContent.replace(/\s+/g, ' ').trim()), ['Splash Entry 1', 'Splash Entry 2', 'Splash Entry 3']);

  // grade every distinct pick a win
  const counts = {};
  lists.flat().forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  Object.keys(counts).forEach(name => app.grade(name));
  const distinct = Object.keys(counts).length;
  const at = k => Object.values(counts).filter(n => n === k).length;
  assert.equal(tile(app, 'Entry 1'), '10-0');
  assert.equal(tile(app, 'Entry 3'), '10-0');
  assert.equal(tile(app, 'All picks'), distinct + '-0');
  assert.equal(tile(app, '3/3 picks'), at(3) + '-0');
  assert.equal(tile(app, '2/3 picks'), at(2) + '-0');
  assert.equal(tile(app, '1/3 picks'), at(1) + '-0');
  assert.deepEqual(tileLabels(app), ['Entry 1', 'Entry 2', 'Entry 3', 'All picks', '3/3 picks', '2/3 picks', '1/3 picks', 'Weeks']);
});

test('a loss on a pick in two entries counts once in All picks and in 2/3 picks, and in both of its entries', async t => {
  const app = await threeEntryPool(t);
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  const counts = {};
  [1, 2, 3].forEach(n => app.entry(n).forEach(name => { counts[name] = (counts[name] || 0) + 1; }));
  const twoOf3 = Object.keys(counts).find(name => counts[name] === 2);
  app.grade(twoOf3, 2); // L
  assert.equal(tile(app, 'All picks'), '0-1');
  assert.equal(tile(app, '2/3 picks'), '0-1');
  const hits = [1, 2, 3].filter(n => app.entry(n).includes(twoOf3)).length;
  assert.equal(hits, 2);
  assert.equal(app.$$('.summary-stats > div').filter(d => /^Entry/.test(d.querySelector('span').textContent) && d.querySelector('strong').textContent === '0-1').length, 2);
});

test('Copy puts every entry of a saved 3-entry week on the clipboard, with grades', async t => {
  const app = await threeEntryPool(t);
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  app.grade(app.entry(1)[0]);
  app.$('.history-copy-btn').click();
  await wait(10);
  const text = app.window.__clipboard;
  assert.equal((text.match(/Splash Entry \d/g) || []).length, 3);
  assert.match(text, /\(W\)/);
  assert.match(app.status(), /All 3 entries from that week are on your clipboard/);
});

test('saving the same 3-entry build twice is caught; Start new week warns when it is unsaved', async t => {
  let message = '';
  const app = await threeEntryPool(t, { confirm: m => { message = m; return false; } });
  app.build();
  app.$('#resetBtn').click();
  assert.match(message, /hasn’t been saved/);
  app.$('#saveWeekBtn').click();
  app.$('#saveWeekBtn').click();
  assert.match(app.status(), /Already saved/);
  message = '';
  app.$('#resetBtn').click();
  assert.doesNotMatch(message, /hasn’t been saved/);
});

// ---------- Hand-entered weeks ----------

test('the past-week form for 3 entries has a row per entry and per level, and fills the 1/3 row itself', async t => {
  const app = await threeEntryPool(t);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  const rows = app.$$('#pastRows .row-label').map(r => r.childNodes[0].textContent);
  assert.deepEqual(rows, ['Entry 1', 'Entry 2', 'Entry 3', '3/3 picks', '2/3 picks', '1/3 picks']);
  fillRow(app, 'e1', [7, 3, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'e3', [8, 2, 0]);
  fillRow(app, 'shared', [2, 1, 0]);
  fillRow(app, 'l2', [4, 2, 0]);
  // wins: 21 = 3x2 + 2x4 + 7 ; losses: 9 = 3x1 + 2x2 + 2
  assert.deepEqual(readRow(app, 'singles'), ['7', '2', '0']);
  assert.ok(app.$('#pastCheck').classList.contains('ok'));
  assert.match(app.$('#pastCheck').textContent, /Adds up: Entry 1 \+ Entry 2 \+ Entry 3 = 3 × \(3\/3 picks\) \+ 2 × \(2\/3 picks\) \+ \(1\/3 picks\)/);
});

test('numbers that cannot add up are flagged for 3 entries, naming both sides', async t => {
  const app = await threeEntryPool(t);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [7, 3, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'e3', [8, 2, 0]);
  fillRow(app, 'shared', [2, 1, 0]);
  fillRow(app, 'l2', [4, 2, 0]);
  fillRow(app, 'singles', [1, 2, 0]);
  assert.ok(app.$('#pastCheck').classList.contains('warn'));
  assert.match(app.$('#pastCheck').textContent, /wins don’t add up: Entry 1 \+ Entry 2 \+ Entry 3 = 21, but 3 × \(3\/3 picks\) \+ 2 × \(2\/3 picks\) \+ \(1\/3 picks\) = 15/);
  typeInto(app, 'past-e1-W', 9);
  typeInto(app, 'past-e1-L', 3);
  assert.match(app.$('#pastCheck').textContent, /Entry 1 adds up to 12 picks, but an entry has 10/);
});

test('a hand-entered 3-entry week shows every record and adds into the season totals', async t => {
  const app = await threeEntryPool(t);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [7, 3, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'e3', [8, 2, 0]);
  fillRow(app, 'shared', [2, 1, 0]);
  fillRow(app, 'l2', [4, 2, 0]);
  app.$('#pastSaveBtn').click();
  const card = app.$('.history-entry.manual');
  const cells = [...card.querySelectorAll('.manual-grid > div')].map(d => d.querySelector('span').textContent + ' ' + d.querySelector('strong').textContent);
  assert.deepEqual(cells, ['Entry 1 7-3', 'Entry 2 6-4', 'Entry 3 8-2', '3/3 picks 2-1', '2/3 picks 4-2', '1/3 picks 7-2']);
  assert.equal(tile(app, 'Entry 3'), '8-2');
  assert.equal(tile(app, 'All picks'), '13-5');
  assert.equal(tile(app, '2/3 picks'), '4-2');

  // a tracked week on top of it
  app.$('#historyCloseBtn').click();
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  app.grade(app.entry(1)[0]);
  assert.match(tile(app, 'Weeks'), /2/);
});

test('editing a hand-entered 3-entry week reopens it with its own shape', async t => {
  const app = await threeEntryPool(t);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [7, 3, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'e3', [8, 2, 0]);
  fillRow(app, 'shared', [2, 1, 0]);
  fillRow(app, 'l2', [4, 2, 0]);
  app.$('#pastSaveBtn').click();
  app.$('#historyCloseBtn').click();
  set(app, '#entriesSelect', 2);       // the pool changes shape later
  app.openHistory();
  app.$('.history-edit-btn').click();
  assert.equal(app.$$('#pastRows .past-row').length, 6, 'the week keeps its 3-entry rows');
  assert.deepEqual(readRow(app, 'e3'), ['8', '2', '0']);
  assert.deepEqual(readRow(app, 'l2'), ['4', '2', '0']);
  typeInto(app, 'past-e3-W', 9);
  app.$('#pastSaveBtn').click();
  assert.equal(tile(app, 'Entry 3'), '9-2');
  // and a new week now uses the 2-entry rows
  app.$('#addPastWeekBtn').click();
  assert.equal(app.$$('#pastRows .past-row').length, 4);
});

test('weeks from different shapes in one pool show a record for each shape', async t => {
  const app = await threeEntryPool(t);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [7, 3, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'e3', [8, 2, 0]);
  fillRow(app, 'shared', [2, 1, 0]);
  fillRow(app, 'l2', [4, 2, 0]);
  app.$('#pastSaveBtn').click();
  app.$('#historyCloseBtn').click();
  set(app, '#entriesSelect', 2);
  app.openHistory();
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [5, 5, 0]);
  fillRow(app, 'e2', [6, 4, 0]);
  fillRow(app, 'shared', [3, 2, 0]);
  assert.deepEqual(tileLabels(app).slice(-1), ['Weeks']);
  app.$('#pastSaveBtn').click();
  assert.deepEqual(tileLabels(app), ['Entry 1', 'Entry 2', 'Entry 3', 'All picks', '2/2 picks', '1/2 picks', '3/3 picks', '2/3 picks', '1/3 picks', 'Weeks']);
  assert.equal(tile(app, 'Entry 1'), '12-8');
});

test('weeks saved before pools had a shape load as 2-entry weeks and keep their grades', async t => {
  const saved = '2026-09-01T12:00:00.000Z';
  const picks = ['A +1', 'B -2', 'C +3', 'D -4', 'E +5', 'F -6', 'G +7'];
  const legacy = {
    teams: [], overlap: 3, result: null,
    history: [{ id: 'w1', savedAt: saved, updatedAt: saved, overlap: 3, entry1: picks, entry2: picks.slice(0, 5).concat(['H', 'I']), results: { 'A +1': 'W', 'B -2': 'L' }, tiers: { 'A +1': 0 } }]
  };
  const app = openApp({ storage: legacy });
  t.after(app.close);
  await wait(20);
  app.openHistory();
  assert.equal(app.$$('.history-columns > div').length, 2);
  assert.equal(tile(app, 'Entry 1'), '1-1');
  assert.equal(tile(app, '2/2 picks'), '1-1');
  assert.equal(app.$('.history-head span').textContent, 'Shared 3');
  assert.equal(app.$$('.grade-btn').length, 14);
});
