const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function setup(t) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  app.build();
  return app;
}

test('Undo is disabled until something changes', async t => {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  assert.equal(app.$('#undoBtn').disabled, true);
});

test('undoes tier changes, moves, and Start new week', async t => {
  const app = await setup(t);
  const builtEntry = app.entry(1).join();

  app.setTier('Team3', 0);
  app.$('#undoBtn').click();
  assert.equal(app.tierOf('Team3'), 2);
  assert.equal(app.entry(1).join(), builtEntry);

  const name = app.entry(1).find(n => !app.shared().includes(n));
  app.card(1, name).querySelector('.pick-action-btn.move').click();
  app.$('#undoBtn').click();
  assert.equal(app.entry(1).join(), builtEntry);

  app.$('#resetBtn').click();
  assert.equal(app.$$('.team-row').length, 0);
  app.$('#undoBtn').click();
  assert.equal(app.$$('.team-row').length, 12);
  assert.equal(app.$('#teamInput').value.split('\n').length, 12);
  assert.equal(app.entry(1).join(), builtEntry);
});

test('Ctrl+Z steps back multiple times but is ignored inside text fields', async t => {
  const app = await setup(t);
  app.setOverlap(4);
  app.setOverlap(5);
  app.keyUndo();
  app.keyUndo();
  assert.equal(app.$('#overlapValue').textContent, '3');
  app.setOverlap(4);
  app.keyUndo(app.$('#teamInput'));
  assert.equal(app.$('#overlapValue').textContent, '4');
});

test('saving and grading weeks are not part of undo', async t => {
  const app = await setup(t);
  app.$('#saveWeekBtn').click();
  assert.equal(app.$('#undoBtn').disabled, false); // the build itself is still undoable
  app.openHistory();
  app.$('.grade-btn').click();
  app.$('#undoBtn').click(); // undoes the build, not the grade or the save
  assert.equal(app.$$('.history-entry').length, 1);
  assert.notEqual(app.$('.grade-btn').textContent, '\u2013');
});
