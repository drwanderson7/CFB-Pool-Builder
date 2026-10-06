// The ✕ on a pick card: remove a team from the current build, refill its slot, put it back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function built(t, names = teamNames(12), overlap = 4) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(names);
  app.setOverlap(overlap);
  app.build();
  return app;
}
const removeBtn = (app, entry, name) => app.card(entry, name).querySelector('.pick-remove');
const exposureOf = (app, name) => JSON.parse(app.window.localStorage.getItem('cfb-splash-pool-builder-v1')).teams.find(t => t.name === name);

test('every pick card has a labeled ✕', async t => {
  const app = await built(t);
  assert.equal(app.$$('.pick-card .pick-remove').length, 14);
  const name = app.entry(1)[0];
  assert.equal(removeBtn(app, 1, name).getAttribute('aria-label'), 'Remove ' + name + ' from this build');
});

test('✕ on an entry-only pick removes it, refills the slot, and keeps the other picks', async t => {
  const app = await built(t);
  const name = app.entry(1).find(n => !app.shared().includes(n));
  const before1 = app.entry(1), before2 = app.entry(2);
  removeBtn(app, 1, name).click();
  assert.ok(!app.entry(1).includes(name) && !app.entry(2).includes(name), 'gone from both entries');
  assert.equal(app.entry(1).length, 7);
  assert.equal(app.entry(2).length, 7);
  assert.equal(app.shared().length, 4, 'overlap kept');
  assert.equal(app.entry(1).filter(n => !before1.includes(n)).length, 1, 'only the one slot changed in entry 1');
  assert.deepEqual(app.entry(2).slice().sort(), before2.slice().sort(), 'entry 2 untouched');
  assert.equal(exposureOf(app, name).max, 0, 'Max set to 0 so it stays out');
  assert.match(app.status(), new RegExp(name + ' removed.*took its place'));
});

test('✕ on a shared pick takes it out of both entries', async t => {
  const app = await built(t);
  const name = app.shared()[0];
  removeBtn(app, 2, name).click();
  assert.ok(!app.entry(1).includes(name) && !app.entry(2).includes(name));
  assert.equal(app.shared().length, 4);
  assert.equal(app.entry(1).length, 7);
});

test('a locked pick can be removed too (the lock is cleared)', async t => {
  const app = await built(t);
  const name = app.entry(1).find(n => !app.shared().includes(n));
  app.card(1, name).querySelector('.pick-action-btn.move').click(); // now locked in entry 2
  removeBtn(app, 2, name).click();
  assert.ok(!app.entry(2).includes(name));
  assert.equal(exposureOf(app, name).fixedMask, 0);
});

test('removed teams show on Benched, and tapping one puts it back in play', async t => {
  const app = await built(t);
  const name = app.entry(1).find(n => !app.shared().includes(n));
  removeBtn(app, 1, name).click();
  const chip = app.$('#benchedList [data-restore]');
  assert.ok(chip, 'removed team is a put-back button');
  assert.match(chip.textContent, new RegExp(name));
  assert.match(chip.textContent, /put back/);
  chip.click();
  assert.equal(exposureOf(app, name).max, 2);
  assert.match(app.status(), /back in play/);
  assert.equal(app.$('#benchedList [data-restore]'), null);
});

test('Undo brings a removed pick back exactly', async t => {
  const app = await built(t);
  const before1 = app.entry(1), before2 = app.entry(2);
  const name = app.entry(1).find(n => !app.shared().includes(n));
  removeBtn(app, 1, name).click();
  app.$('#undoBtn').click();
  assert.deepEqual(app.entry(1), before1);
  assert.deepEqual(app.entry(2), before2);
  assert.equal(exposureOf(app, name).max, 2);
});

test('when there is no team left to fill the slot, nothing changes and it says why', async t => {
  const app = await built(t, teamNames(10), 4); // 10 teams = exactly enough for overlap 4
  const before1 = app.entry(1);
  const name = before1[0];
  removeBtn(app, 1, name).click();
  assert.deepEqual(app.entry(1), before1);
  assert.match(app.status(), /Couldn.t remove/);
});
