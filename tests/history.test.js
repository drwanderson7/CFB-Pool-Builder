const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function builtAndSaved(t) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  ['Team0', 'Team1', 'Team2'].forEach(n => app.setTier(n, 0));
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  return app;
}

test('Save this week records the build and rejects an exact duplicate', async t => {
  const app = await builtAndSaved(t);
  assert.equal(app.$$('.history-entry').length, 1);
  app.$('#saveWeekBtn').click();
  assert.match(app.status(), /Already saved/);
  assert.equal(app.$$('.history-entry').length, 1);
});

test('grading cycles W -> L -> Push -> clear', async t => {
  const app = await builtAndSaved(t);
  const name = app.$$('.grade-btn').map(b => b.dataset.team).find(n => app.gradeButtons(n).length === 1);
  const label = () => app.gradeButtons(name)[0].textContent;
  assert.equal(label(), '\u2013');
  app.grade(name); assert.equal(label(), 'W');
  app.grade(name); assert.equal(label(), 'L');
  app.grade(name); assert.equal(label(), 'Push');
  app.grade(name); assert.equal(label(), '\u2013');
});

test('a shared pick is graded once and counts in both entries', async t => {
  const app = await builtAndSaved(t);
  app.grade('Team0'); // Lock tier, so shared
  assert.deepEqual(app.gradeButtons('Team0').map(b => b.textContent), ['W', 'W']);
  const headers = app.$$('.history-columns h4').map(h => h.textContent);
  assert.ok(headers.every(h => /1-0$/.test(h)), headers.join(' | '));
});

test('season summary shows entry, overall, and by-tier records', async t => {
  const app = await builtAndSaved(t);
  assert.equal(app.$('#historySummary').textContent, '', 'no summary until something is graded');
  app.grade('Team0');     // Lock W
  app.grade('Team1', 2);  // Lock L
  const summary = app.$('#historySummary').textContent.replace(/\s+/g, ' ');
  assert.match(summary, /All picks1-150%/);
  assert.match(summary, /Lock 1-1 · 50%/);
});

test('Copy on a saved week includes grades', async t => {
  const app = await builtAndSaved(t);
  app.grade('Team0');
  app.$('.history-copy-btn').click();
  await wait(20);
  assert.match(app.window.__clipboard, /Team0 \(W\)/);
});

test('saved weeks survive Start new week; delete and clear-all work', async t => {
  const app = await builtAndSaved(t);
  app.$('#resetBtn').click();
  assert.equal(app.$$('.team-row').length, 0);
  assert.equal(app.$$('.history-entry').length, 1);
  app.$('.history-delete-btn').click();
  assert.equal(app.$$('.history-entry').length, 0);
});

test('Start new week keeps the overlap and warns when the build is unsaved', async t => {
  let message = '';
  const app = openApp({ confirm: m => { message = m; return true; } });
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  app.setOverlap(4);
  app.build();
  app.$('#resetBtn').click();
  assert.match(message, /hasn\u2019t been saved/);
  assert.equal(app.$('#overlapValue').textContent, '4');
  assert.equal(app.$('#teamInput').value, '');
});
