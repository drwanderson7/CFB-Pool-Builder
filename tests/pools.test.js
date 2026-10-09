// Several pools in one tool: switcher, isolation, copy teams, delete, sync, import/export.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, createBackend, teamNames, wait, SYNC_WAIT } = require('./helpers');

function set(app, selector, value) {
  const el = app.$(selector);
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('change', { bubbles: true }));
}
const tabs = app => app.$$('.pool-tab').map(b => b.textContent.replace(/\s+/g, ' ').trim());
const activeTab = app => (app.$('.pool-tab.active') || {}).textContent;
const tab = (app, i) => app.$$('.pool-tab')[i];

async function open(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(30);
  return app;
}

test('a new device has one pool, named Pick 7, and no delete button', async t => {
  const app = await open(t);
  assert.deepEqual(tabs(app), ['Pick 7 7 × 2']);
  assert.ok(app.$('#deletePoolBtn').classList.contains('hidden'));
  assert.match(app.$('#historyTitle').textContent, /Saved weeks · Pick 7/);
});

test('Add pool creates "Pool 2", switches to it, and starts it empty', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.$('#addPoolBtn').click();
  assert.deepEqual(tabs(app), ['Pick 7 7 × 2', 'Pool 2 7 × 2']);
  assert.match(activeTab(app), /^Pool 2/);
  assert.equal(app.$$('.team-row').length, 0);
  assert.equal(app.$('#poolName').value, 'Pool 2');
  assert.ok(!app.$('#deletePoolBtn').classList.contains('hidden'));
  app.$('#addPoolBtn').click();
  assert.match(tabs(app)[2], /^Pool 3/);
});

test('pools keep their own teams, shape, build and saved weeks', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.build();
  const pick7Entry1 = app.entry(1);
  app.$('#saveWeekBtn').click();

  app.$('#addPoolBtn').click();
  app.loadTeams(teamNames(24).map(n => 'Ten' + n));
  set(app, '#picksSelect', 10);
  set(app, '#entriesSelect', 3);
  app.build();
  assert.equal(app.entry(3).length, 10);
  assert.match(tabs(app)[1], /10 × 3/);
  app.openHistory();
  assert.equal(app.$$('.history-entry').length, 0, 'the new pool has no saved weeks');
  assert.match(app.$('#historyTitle').textContent, /Saved weeks · Pool 2/);
  app.$('#historyCloseBtn').click();

  tab(app, 0).click();
  assert.equal(app.$$('.team-row').length, 12);
  assert.deepEqual(app.entry(1), pick7Entry1);
  assert.equal(app.$('#entry3Zone'), null, 'only two entry cards in the 2-entry pool');
  app.openHistory();
  assert.equal(app.$$('.history-entry').length, 1);

  app.$('#historyCloseBtn').click();
  tab(app, 1).click();
  assert.equal(app.entry(3).length, 10);
  assert.ok(app.$$('.team-row')[0].querySelector('.team-name').title.startsWith('Ten'));
});

test('records are per pool: grading in one pool does not touch the other', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.build();
  app.$('#saveWeekBtn').click();
  app.openHistory();
  app.grade(app.entry(1)[0]);
  const summary = () => app.$$('.summary-stats > div').map(d => d.textContent.replace(/\s+/g, ' ').trim()).join('|');
  const before = summary();
  app.$('#historyCloseBtn').click();

  app.$('#addPoolBtn').click();
  app.openHistory();
  assert.equal(app.$$('.summary-stats > div').length === 0 || !/1-0/.test(summary()), true);
  app.$('#historyCloseBtn').click();
  tab(app, 0).click();
  app.openHistory();
  assert.equal(summary(), before);
});

test('renaming a pool updates the tab, the history title and the print heading', async t => {
  const app = await open(t);
  const name = app.$('#poolName');
  name.value = 'Office Pool';
  name.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  assert.match(tabs(app)[0], /^Office Pool/);
  assert.match(app.$('#historyTitle').textContent, /Office Pool/);
  assert.equal(app.$('#printPoolName').textContent, 'Office Pool');
  name.value = '   ';
  name.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  assert.match(tabs(app)[0], /^Pick 7/, 'a blank name falls back to Pick <n>');
});

test('Delete pool asks first; cancel keeps it, OK removes it and returns to the first pool', async t => {
  let answer = false;
  const app = await open(t, { confirm: () => answer });
  app.$('#addPoolBtn').click();
  app.$('#deletePoolBtn').click();
  assert.equal(tabs(app).length, 2);
  answer = true;
  app.$('#deletePoolBtn').click();
  assert.deepEqual(tabs(app), ['Pick 7 7 × 2']);
  assert.ok(app.$('#deletePoolBtn').classList.contains('hidden'));
  assert.match(app.status(), /Pool deleted/);
});

test('Copy its teams & tiers brings teams and tiers, not the build or the other shape', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.setTier('Team3', 0);
  app.setTier('Team9', 3);
  app.build();
  app.$('#addPoolBtn').click();
  assert.ok(!app.$('#copyFromRow').classList.contains('hidden'));
  app.$('#copyFromBtn').click();
  assert.equal(app.$$('.team-row').length, 12);
  assert.equal(app.tierOf('Team3'), 0);
  assert.equal(app.tierOf('Team9'), 3);
  assert.equal(app.entry(1).length, 0, 'no build yet');
  // editing the copy leaves the source alone
  app.setTier('Team3', 2);
  tab(app, 0).click();
  assert.equal(app.tierOf('Team3'), 0);
});

test('Copy asks before replacing teams already in the pool', async t => {
  let asked = 0, answer = false;
  const app = await open(t, { confirm: () => { asked++; return answer; } });
  app.loadTeams(teamNames(12));
  app.$('#addPoolBtn').click();
  app.loadTeams(teamNames(8).map(n => 'Other' + n));
  app.$('#copyFromBtn').click();
  assert.equal(asked, 1);
  assert.equal(app.$$('.team-row').length, 8);
  answer = true;
  app.$('#copyFromBtn').click();
  assert.equal(app.$$('.team-row').length, 12);
});

test('the pool you were last in is the one that opens, per device', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  laptop.loadTeams(teamNames(12));
  laptop.$('#addPoolBtn').click();
  await wait(SYNC_WAIT);
  const id = laptop.window.localStorage.getItem('cfb-pool-active');
  assert.ok(id && id !== 'main');
  const reopened = await open(t, { backend, storage: JSON.parse(laptop.window.localStorage.getItem('cfb-splash-pool-builder-v1')), local: { 'cfb-pool-active': id } });
  await wait(200);
  assert.match(activeTab(reopened), /^Pool 2/);
  const other = await open(t, { backend });
  await wait(200);
  assert.match(activeTab(other), /^Pick 7/, 'a device that never chose opens the first pool');
});

test('a pool added on one device appears on the other, and edits sync into the right pool', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  laptop.loadTeams(teamNames(12));
  laptop.$('#addPoolBtn').click();
  laptop.loadTeams(teamNames(20).map(n => 'B' + n));
  set(laptop, '#picksSelect', 10);
  set(laptop, '#entriesSelect', 3);
  await wait(SYNC_WAIT);

  const phone = await open(t, { backend });
  await wait(200);
  assert.equal(tabs(phone).length, 2);
  assert.match(tabs(phone)[1], /10 × 3/);
  tab(phone, 1).click();
  assert.equal(phone.$$('.team-row').length, 20);

  // phone edits pool 2; laptop (still on pool 2) picks it up when it returns
  phone.setTier('BTeam4', 0);
  await wait(SYNC_WAIT);
  laptop.becomeVisible();
  await wait(200);
  assert.equal(laptop.tierOf('BTeam4'), 0);
  tab(laptop, 0).click();
  assert.equal(laptop.$$('.team-row').length, 12);
});

test('deleting a pool on one device removes it on the other and it does not come back', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  laptop.$('#addPoolBtn').click();
  await wait(SYNC_WAIT);
  const phone = await open(t, { backend });
  await wait(200);
  assert.equal(tabs(phone).length, 2);

  laptop.$('#deletePoolBtn').click();
  await wait(SYNC_WAIT);
  assert.equal(Object.keys(backend.data.deleted).length, 1);
  phone.becomeVisible();
  await wait(200);
  assert.equal(tabs(phone).length, 1);
  await wait(SYNC_WAIT);
  assert.equal(backend.data.pools.length, 1, 'the stale device does not resurrect it');
});

test('the saved payload keeps the old top-level fields for the first pool and lists every pool', async t => {
  const backend = createBackend();
  const app = await open(t, { backend });
  app.loadTeams(teamNames(12));
  app.build();
  app.$('#addPoolBtn').click();
  app.loadTeams(teamNames(9).map(n => 'Z' + n));
  await wait(SYNC_WAIT);
  const data = backend.data;
  assert.equal(data.teams.length, 12, 'older devices and the API still see the first pool');
  assert.equal(data.pools.length, 2);
  assert.equal(data.pools[1].teams.length, 9);
  assert.equal(data.v, 2);
});

test('server data from before pools opens as the "Pick 7" pool', async t => {
  const backend = createBackend();
  backend.data = { teams: teamNames(12).map((n, i) => ({ id: 'x' + i, name: n, min: 0, max: 2, fixedMask: 0, tier: 1 })), overlap: 4, result: null, history: [] };
  const app = await open(t, { backend });
  await wait(200);
  assert.deepEqual(tabs(app), ['Pick 7 7 × 2']);
  assert.equal(app.$$('.team-row').length, 12);
  assert.equal(app.$('#overlapValue').textContent, '4');
});

test('Copy / Load setup code carries every pool; an old single-pool code loads into the pool you are in', async t => {
  const a = await open(t);
  a.loadTeams(teamNames(12));
  a.$('#addPoolBtn').click();
  a.loadTeams(teamNames(9).map(n => 'Q' + n));
  a.$('#transferBtn').click();
  const code = a.$('#transferOut').value;
  assert.equal(JSON.parse(code).pools.length, 2);

  const b = await open(t);
  b.$('#transferBtn').click();
  b.$('#transferIn').value = code;
  b.$('#loadSetupBtn').click();
  assert.equal(tabs(b).length, 2);
  tab(b, 1).click();
  assert.equal(b.$$('.team-row').length, 9);

  const old = JSON.stringify({ teams: teamNames(12).map((n, i) => ({ id: 'o' + i, name: 'Old' + n, min: 0, max: 2, fixedMask: 0, tier: 1 })), overlap: 3, result: null, history: [] });
  const c = await open(t);
  c.$('#addPoolBtn').click();
  c.$('#transferBtn').click();
  c.$('#transferIn').value = old;
  c.$('#loadSetupBtn').click();
  assert.equal(tabs(c).length, 2, 'no new pool is created');
  assert.match(activeTab(c), /^Pool 2/);
  assert.equal(c.$$('.team-row').length, 12);
  tab(c, 0).click();
  assert.equal(c.$$('.team-row').length, 0);
});

test('switching pools clears Undo so it cannot undo the other pool', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  app.build();
  app.$('#addPoolBtn').click();
  app.loadTeams(teamNames(9).map(n => 'Z' + n));
  tab(app, 0).click();
  app.keyUndo();
  assert.equal(app.$$('.team-row').length, 12);
  tab(app, 1).click();
  assert.equal(app.$$('.team-row').length, 9);
});
