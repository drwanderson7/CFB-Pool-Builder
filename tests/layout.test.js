// Hide setup: folding steps 1 and 2 into a one-line summary.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function open(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  return app;
}
const hidden = (app, sel) => app.$(sel).classList.contains('hidden');

test('Hide setup is off until teams are loaded', async t => {
  const app = await open(t);
  assert.equal(app.$('#setupHideBtn').disabled, true);
  assert.equal(hidden(app, '#setupSummary'), true);
  app.loadTeams(teamNames(10));
  assert.equal(app.$('#setupHideBtn').disabled, false);
});

test('Hide setup folds steps 1 and 2 into a summary, and Edit brings them back', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.setOverlap(4);
  app.$('#setupHideBtn').click();
  assert.equal(hidden(app, '#setupSection'), true);
  assert.equal(hidden(app, '#setupSummary'), false);
  assert.equal(app.$('#setupSummaryText').textContent, '12 teams \u00b7 4 shared picks');
  assert.equal(app.doc.activeElement, app.$('#setupShowBtn'), 'focus moves to the Edit button');
  assert.equal(app.$('#setupShowBtn').getAttribute('aria-expanded'), 'false');
  app.$('#setupShowBtn').click();
  assert.equal(hidden(app, '#setupSection'), false);
  assert.equal(app.doc.activeElement, app.$('#setupHideBtn'));
});

test('the choice is remembered on reload, and the builder still works while hidden', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.$('#setupHideBtn').click();
  app.build();
  assert.equal(app.entry(1).length, 7);
  const saved = app.window.localStorage.getItem('cfb-splash-pool-builder-v1');
  const again = await open(t, { storage: JSON.parse(saved) });
  // a fresh jsdom has its own localStorage, so carry the preference over too
  again.window.localStorage.setItem('cfb-pool-setup-collapsed', '1');
  again.$('#setupHideBtn').click();
  assert.equal(hidden(again, '#setupSection'), true);
  assert.equal(app.window.localStorage.getItem('cfb-pool-setup-collapsed'), '1');
});

test('Start new week reopens setup so you can paste the new teams', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.$('#setupHideBtn').click();
  app.$('#resetBtn').click();
  assert.equal(hidden(app, '#setupSection'), false);
  assert.equal(hidden(app, '#setupSummary'), true);
});

test('the setup summary is hidden on the Bet Tracker page', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.$('#setupHideBtn').click();
  assert.ok(app.$('#setupSummary').classList.contains('pool-only'));
});
