// Weeks entered by hand (records only), and the 2/2 vs 1/2 picks records.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, createBackend, teamNames, wait, SYNC_WAIT } = require('./helpers');

async function open(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  app.openHistory();
  return app;
}
function setInput(app, id, value) {
  const el = app.$('#' + id);
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}
const fillRow = (app, row, rec) => ['W', 'L', 'P'].forEach((col, i) => setInput(app, `past-${row}-${col}`, rec[i]));
const readRow = (app, row) => ['W', 'L', 'P'].map(col => app.$(`#past-${row}-${col}`).value);

// Adds a week through the form. Leave `singles` out to let the form work it out.
function addWeek(app, week, e1, e2, shared, singles) {
  app.$('#addPastWeekBtn').click();
  setInput(app, 'pastWeek', week);
  fillRow(app, 'e1', e1);
  fillRow(app, 'e2', e2);
  fillRow(app, 'shared', shared);
  if (singles) fillRow(app, 'singles', singles);
  app.$('#pastSaveBtn').click();
}
function summary(app, label) {
  const cell = app.$$('.summary-stats > div').find(d => d.querySelector('span').textContent === label);
  return cell && { record: cell.querySelector('strong').textContent, pct: cell.querySelector('em') && cell.querySelector('em').textContent };
}
const manualCards = app => app.$$('.history-entry.manual');
const weekTitles = app => manualCards(app).map(c => c.querySelector('.history-head strong').textContent);

// ---------- The form ----------

test('the form suggests a week number and fills in the 1/2 picks record as you go', async t => {
  const app = await open(t);
  assert.ok(app.$('#pastForm').classList.contains('hidden'));
  app.$('#addPastWeekBtn').click();
  assert.ok(!app.$('#pastForm').classList.contains('hidden'));
  assert.equal(app.$('#pastWeek').value, '1');
  assert.equal(app.doc.activeElement, app.$('#pastWeek'));

  fillRow(app, 'e1', [5, 2, 0]);
  fillRow(app, 'e2', [4, 3, 0]);
  fillRow(app, 'shared', [3, 1, 0]);
  assert.deepEqual(readRow(app, 'singles'), ['3', '3', '0'], 'Entry 1 + Entry 2 - 2 x (2/2 picks)');
  assert.match(app.$('#pastCheck').textContent, /Adds up/);
  assert.ok(app.$('#pastCheck').classList.contains('ok'));
});

test('numbers that cannot all be right get a warning, but can still be saved', async t => {
  const app = await open(t);
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [5, 2, 0]);
  fillRow(app, 'e2', [4, 3, 0]);
  fillRow(app, 'shared', [3, 1, 0]);
  fillRow(app, 'singles', [1, 1, 0]); // should be 3-3
  assert.ok(app.$('#pastCheck').classList.contains('warn'));
  assert.match(app.$('#pastCheck').textContent, /wins don\u2019t add up: Entry 1 \+ Entry 2 = 9, but 2 \u00d7 \(2\/2 picks\) \+ \(1\/2 picks\) = 7/);
  assert.match(app.$('#pastCheck').textContent, /losses don\u2019t add up/);
  assert.match(app.$('#pastCheck').textContent, /You can still save it/);
  app.$('#pastSaveBtn').click();
  assert.equal(manualCards(app).length, 1);
});

test('an entry with more than 7 picks is flagged', async t => {
  const app = await open(t);
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [6, 2, 0]);
  assert.match(app.$('#pastCheck').textContent, /Entry 1 adds up to 8 picks, but an entry has 7/);
});

test('once you type in the 1/2 picks row it stops being overwritten', async t => {
  const app = await open(t);
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'singles', [2, 2, 0]);
  setInput(app, 'past-e1-W', 6);
  assert.deepEqual(readRow(app, 'singles'), ['2', '2', '0']);
});

test('saving needs a week and some numbers, and one record per week', async t => {
  const app = await open(t);
  app.$('#addPastWeekBtn').click();
  setInput(app, 'pastWeek', '');
  app.$('#pastSaveBtn').click();
  assert.match(app.$('#pastError').textContent, /Enter the week number/);

  setInput(app, 'pastWeek', 1);
  app.$('#pastSaveBtn').click();
  assert.match(app.$('#pastError').textContent, /at least one record/);
  assert.equal(manualCards(app).length, 0);

  fillRow(app, 'e1', [4, 3, 0]);
  fillRow(app, 'e2', [4, 3, 0]);
  fillRow(app, 'shared', [2, 2, 0]);
  app.$('#pastSaveBtn').click();
  assert.equal(manualCards(app).length, 1);

  app.$('#addPastWeekBtn').click();
  setInput(app, 'pastWeek', 1);
  fillRow(app, 'e1', [1, 0, 0]);
  app.$('#pastSaveBtn').click();
  assert.match(app.$('#pastError').textContent, /Week 1 already has a record/);
  assert.equal(manualCards(app).length, 1);
});

test('Enter saves, Cancel closes without saving', async t => {
  const app = await open(t);
  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [4, 3, 0]);
  app.$('#pastCancelBtn').click();
  assert.ok(app.$('#pastForm').classList.contains('hidden'));
  assert.equal(manualCards(app).length, 0);

  app.$('#addPastWeekBtn').click();
  fillRow(app, 'e1', [4, 3, 0]);
  app.$('#past-e1-W').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(manualCards(app).length, 1);
});

// ---------- Cards and the season record ----------

test('a saved week shows its four records and feeds the season summary', async t => {
  const app = await open(t);
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  const card = manualCards(app)[0];
  assert.match(card.textContent, /Week 1/);
  assert.match(card.textContent, /Entered by hand/);
  const cells = [...card.querySelectorAll('.manual-grid > div')].map(d => d.querySelector('span').textContent + ' ' + d.querySelector('strong').textContent);
  assert.deepEqual(cells, ['Entry 1 5-2', 'Entry 2 4-3', '2/2 picks 3-1', '1/2 picks 3-3']);

  assert.equal(summary(app, 'Entry 1').record, '5-2');
  assert.equal(summary(app, 'Entry 2').record, '4-3');
  assert.equal(summary(app, '2/2 picks').record, '3-1');
  assert.equal(summary(app, '1/2 picks').record, '3-3');
  assert.equal(summary(app, 'All picks').record, '6-4');
  assert.equal(summary(app, 'Weeks').record, '1');
  assert.equal(summary(app, '2/2 picks').pct, '75%');
});

test('weeks are listed newest first by week number, and totals add across weeks', async t => {
  const app = await open(t);
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  addWeek(app, 3, [4, 3, 0], [6, 1, 0], [3, 1, 0]);
  addWeek(app, 2, [3, 4, 0], [3, 4, 0], [1, 2, 0]);
  assert.deepEqual(weekTitles(app), ['Week 3', 'Week 2', 'Week 1']);
  assert.equal(summary(app, 'Entry 1').record, '12-9');
  assert.equal(summary(app, '2/2 picks').record, '7-4');
  assert.equal(summary(app, 'Weeks').record, '3');
});

test('Edit loads a week into the form, saving replaces it, and Delete removes it', async t => {
  const app = await open(t);
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  manualCards(app)[0].querySelector('.history-edit-btn').click();
  assert.equal(app.$('#pastTitle').textContent, 'Edit Week 1');
  assert.equal(app.$('#pastWeek').value, '1');
  assert.deepEqual(readRow(app, 'e1'), ['5', '2', '0']);
  assert.deepEqual(readRow(app, 'singles'), ['3', '3', '0']);

  setInput(app, 'past-e1-W', 6);
  setInput(app, 'past-e1-L', 1);
  app.$('#pastSaveBtn').click();
  assert.equal(manualCards(app).length, 1, 'edited in place, not duplicated');
  assert.equal(summary(app, 'Entry 1').record, '6-1');

  manualCards(app)[0].querySelector('.history-delete-btn').click();
  assert.equal(manualCards(app).length, 0);
  assert.equal(app.$('#historySummary').textContent, '');
});

// ---------- 2/2 and 1/2 records for weeks tracked here ----------

async function trackedWeek(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  app.setOverlap(4);
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  return app;
}

test('a tracked week gets its own 2/2 and 1/2 picks records from the grades', async t => {
  const app = await trackedWeek(t);
  const both = new Set(app.entry(2));
  const shared = app.entry(1).filter(n => both.has(n));
  const singles = app.entry(1).filter(n => !both.has(n)).concat(app.entry(2).filter(n => !new Set(app.entry(1)).has(n)));
  assert.equal(shared.length, 4);
  assert.equal(singles.length, 6);
  shared.forEach(n => app.grade(n));                      // 4 wins
  singles.slice(0, 2).forEach(n => app.grade(n));         // 2 wins
  singles.slice(2).forEach(n => app.grade(n, 2));         // 4 losses

  assert.equal(summary(app, '2/2 picks').record, '4-0');
  assert.equal(summary(app, '1/2 picks').record, '2-4');
  assert.equal(summary(app, 'All picks').record, '6-4');
  assert.equal(summary(app, 'Weeks').record, '1');
  assert.match(app.$('.history-mix').textContent, /2\/2 picks 4-0 \u00b7 1\/2 picks 2-4/);
  // each entry = the 4 shared wins plus that entry's own singles
  const e1Singles = app.entry(1).filter(n => !both.has(n));
  const e1 = { W: 4 + e1Singles.filter(n => singles.indexOf(n) < 2).length, L: e1Singles.filter(n => singles.indexOf(n) >= 2).length };
  assert.equal(summary(app, 'Entry 1').record, e1.W + '-' + e1.L);
});

test('hand-entered and tracked weeks add together in the season totals', async t => {
  const app = await trackedWeek(t);
  const both = new Set(app.entry(2));
  app.entry(1).filter(n => both.has(n)).forEach(n => app.grade(n)); // 4 shared wins
  app.entry(1).filter(n => !both.has(n)).forEach(n => app.grade(n)); // 3 entry-1 singles win
  app.entry(2).filter(n => !new Set(app.entry(1)).has(n)).forEach(n => app.grade(n, 2)); // 3 entry-2 singles lose
  assert.equal(summary(app, '2/2 picks').record, '4-0');
  assert.equal(summary(app, '1/2 picks').record, '3-3');

  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  assert.equal(summary(app, '2/2 picks').record, '7-1');
  assert.equal(summary(app, '1/2 picks').record, '6-6');
  assert.equal(summary(app, 'All picks').record, '13-7');
  assert.equal(summary(app, 'Weeks').record, '2');
  assert.deepEqual(app.$$('.history-section').map(h => h.textContent), ['Saved builds', 'Weeks entered by hand']);
});

test('by-tier records only use tracked weeks, and say so when weeks were entered by hand', async t => {
  const app = await trackedWeek(t);
  app.grade(app.entry(1)[0]);
  assert.equal(app.$('.summary-tiers > span').textContent, 'By tier');
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  assert.equal(app.$('.summary-tiers > span').textContent, 'By tier (saved builds only)');
});

// ---------- Interactions with the rest of the tool ----------

test('saving the same build twice is still caught when a hand-entered week is newer', async t => {
  const app = await trackedWeek(t);
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  app.$('#historyCloseBtn').click();
  app.$('#saveWeekBtn').click();
  assert.match(app.status(), /Already saved/);
  assert.equal(app.$$('.history-entry:not(.manual)').length, 1);
});

test('Start new week does not call the build unsaved just because a hand-entered week is newer', async t => {
  let message = '';
  const app = await trackedWeek(t, { confirm: m => { message = m; return true; } });
  addWeek(app, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  app.$('#historyCloseBtn').click();
  app.$('#resetBtn').click();
  assert.doesNotMatch(message, /hasn\u2019t been saved/);
  assert.equal(app.$$('.team-row').length, 0);
  app.openHistory();
  assert.equal(manualCards(app).length, 1, 'the hand-entered week survives Start new week');
});

test('hand-entered weeks sync to the other device, and the newest edit wins', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  await wait(50);
  addWeek(laptop, 1, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  await wait(SYNC_WAIT);

  const phone = await open(t, { backend });
  await wait(250);
  assert.deepEqual(weekTitles(phone), ['Week 1']);
  assert.equal(summary(phone, '2/2 picks').record, '3-1');

  manualCards(phone)[0].querySelector('.history-edit-btn').click();
  setInput(phone, 'past-shared-W', 2);
  phone.$('#pastSaveBtn').click();
  await wait(SYNC_WAIT);
  laptop.becomeVisible();
  await wait(300);
  assert.equal(summary(laptop, '2/2 picks').record, '2-1');
  assert.equal(manualCards(laptop).length, 1);
});

test('hand-entered weeks travel in a Copy / Load setup code, and bad numbers are cleaned up', async t => {
  const source = await open(t);
  source.loadTeams(teamNames(12));
  addWeek(source, 2, [5, 2, 0], [4, 3, 0], [3, 1, 0]);
  source.$('#historyCloseBtn').click();
  source.$('#transferBtn').click();
  const code = JSON.parse(source.$('#transferOut').value);
  assert.equal(code.history.length, 1);
  assert.equal(code.history[0].manual.week, 2);

  const hist = code.pools[0].history[0];
  hist.manual.entries[0] = [-5, 99, 'x'];   // nonsense
  hist.manual.week = 400;
  const target = await open(t);
  target.loadTeams(teamNames(12));
  target.$('#historyCloseBtn').click();
  target.$('#transferBtn').click();
  target.$('#transferIn').value = JSON.stringify(code);
  target.$('#loadSetupBtn').click();
  target.openHistory();
  const card = manualCards(target)[0];
  assert.match(card.querySelector('.history-head strong').textContent, /Week 30/);
  assert.match(card.querySelector('.manual-grid > div strong').textContent, /^0-7$/, 'an entry cannot win more than its 7 picks');
});

test('Tab wraps inside Saved weeks, ignoring the form while it is closed', async t => {
  const app = await open(t);
  const first = app.$('#historyCloseBtn');
  assert.equal(app.doc.activeElement, first);
  first.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(app.doc.activeElement, app.$('#addPastWeekBtn'), 'last visible control, not a hidden form field');
});
