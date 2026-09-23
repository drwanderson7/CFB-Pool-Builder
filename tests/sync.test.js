const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, createBackend, teamNames, wait, SYNC_WAIT } = require('./helpers');

function device(t, backend) {
  const app = openApp({ backend });
  t.after(app.close);
  return app;
}

test('a build made on one device shows up on the other when it opens', async t => {
  const backend = createBackend();
  const laptop = device(t, backend);
  await wait(50);
  laptop.loadTeams(teamNames(12));
  laptop.setOverlap(4);
  laptop.build();
  await wait(SYNC_WAIT);

  const phone = device(t, backend);
  await wait(200);
  assert.deepEqual(phone.entry(1), laptop.entry(1));
  assert.equal(phone.$('#overlapValue').textContent, '4');
  assert.match(phone.status(), /Synced from your other device/);
});

test('changes on the phone reach the laptop when it comes back to the tab', async t => {
  const backend = createBackend();
  const laptop = device(t, backend);
  await wait(50);
  laptop.loadTeams(teamNames(12));
  await wait(SYNC_WAIT);
  const phone = device(t, backend);
  await wait(200);
  phone.setTier('Team5', 0);
  await wait(SYNC_WAIT);
  laptop.becomeVisible();
  await wait(200);
  assert.equal(laptop.tierOf('Team5'), 0);
});

test('saved weeks from both devices merge instead of overwriting', async t => {
  const backend = createBackend();
  const laptop = device(t, backend);
  await wait(50);
  laptop.loadTeams(teamNames(12));
  laptop.setOverlap(4);
  laptop.build();
  laptop.$('#saveWeekBtn').click();
  await wait(SYNC_WAIT);
  const phone = device(t, backend);
  await wait(200);
  phone.setOverlap(3);
  phone.build();
  phone.$('#saveWeekBtn').click();
  await wait(SYNC_WAIT);
  laptop.becomeVisible();
  await wait(300);
  laptop.openHistory();
  assert.equal(laptop.$$('.history-entry').length, 2);
});

test('grades made on the other device are kept (newest copy of a week wins)', async t => {
  const backend = createBackend();
  const laptop = device(t, backend);
  await wait(50);
  laptop.loadTeams(teamNames(12));
  laptop.build();
  laptop.$('#saveWeekBtn').click();
  laptop.openHistory();
  const first = laptop.$$('.grade-btn')[0].dataset.team;
  laptop.grade(first);
  await wait(SYNC_WAIT);
  const phone = device(t, backend);
  await wait(200);
  phone.openHistory();
  const second = phone.$$('.grade-btn').map(b => b.dataset.team).find(n => n !== first);
  phone.grade(second, 2); // L
  await wait(SYNC_WAIT);
  laptop.becomeVisible();
  await wait(300);
  assert.equal(laptop.gradeButtons(first)[0].textContent, 'W');
  assert.equal(laptop.gradeButtons(second)[0].textContent, 'L');
});

test('changes made while offline are pushed first, not overwritten, when back online', async t => {
  const backend = createBackend();
  const app = device(t, backend);
  await wait(50);
  app.loadTeams(teamNames(12));
  await wait(SYNC_WAIT);
  backend.mode = 'offline';
  app.build();
  await wait(SYNC_WAIT);
  assert.equal(app.syncKind(), 'sync-warn');
  assert.equal(backend.data.result, null, 'server still has the pre-build copy');
  backend.mode = 'up';
  app.window.dispatchEvent(new app.window.Event('online'));
  await wait(300);
  assert.equal(app.entry(1).length, 7, 'offline build kept');
  assert.ok(backend.data.result, 'offline build reached the server');
  assert.match(app.syncLabel(), /Synced/);
});

test('sync pill reports each server state, and tapping it retries', async t => {
  const backend = createBackend();
  const app = device(t, backend);
  assert.match(app.syncLabel(), /Checking/);
  await wait(100);
  assert.match(app.syncLabel(), /Synced just now/);
  const cases = [['404', /not set up/, 'sync-warn'], ['notconnected', /not set up/, 'sync-warn'],
    ['500', /Sync error/, 'sync-error'], ['offline', /Offline/, 'sync-warn'], ['up', /Synced/, 'sync-ok']];
  for (const [mode, label, kind] of cases) {
    backend.mode = mode;
    app.$('#syncStatus').click();
    await wait(150);
    assert.match(app.syncLabel(), label, mode);
    assert.equal(app.syncKind(), kind, mode);
  }
});

test('the tool works normally with no sync server at all', async t => {
  const app = device(t, null);
  await wait(50);
  app.loadTeams(teamNames(12));
  app.build();
  assert.equal(app.entry(1).length, 7);
  assert.match(app.status(), /Entries updated/);
});

test('an empty server gets seeded with this device\u2019s data', async t => {
  const backend = createBackend();
  const storage = { teams: teamNames(12).map((name, i) => ({ id: 't' + i, name, min: 0, max: 2, fixedMask: 0, tier: 2 })), overlap: 3, result: null, history: [] };
  const app = openApp({ backend, storage });
  t.after(app.close);
  await wait(SYNC_WAIT + 200);
  assert.equal(backend.data && backend.data.teams.length, 12);
});
