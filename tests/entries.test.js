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

test('shared picks are listed first in both entries and marked Shared', async t => {
  const app = await built(t);
  for (const n of [1, 2]) {
    const cards = app.$$('#entry' + n + 'Zone .pick-card');
    const flags = cards.map(c => c.classList.contains('shared'));
    assert.deepEqual(flags, [true, true, true, true, false, false, false]);
    assert.equal(app.$$('#entry' + n + 'Zone .shared-marker').length, 4);
  }
});

test('"Move to" moves a pick to the other entry and locks it there', async t => {
  const app = await built(t);
  const name = app.entry(1).find(n => !app.shared().includes(n));
  app.card(1, name).querySelector('.pick-action-btn.move').click();
  assert.ok(app.entry(2).includes(name) && !app.entry(1).includes(name));
  assert.ok(app.card(2, name).querySelector('.pick-action-btn.unlock'), 'now locked, so Unlock is offered');
  assert.equal(app.entry(1).length, 7);
  assert.equal(app.entry(2).length, 7);
});

test('shared picks have no Move button', async t => {
  const app = await built(t);
  const name = app.shared()[0];
  assert.equal(app.card(1, name).querySelector('.pick-action-btn.move'), null);
});

test('Copy entry copies the picks in on-screen order with original names', async t => {
  const names = ['Purdue +14.5', 'Va Tech -2.5', 'Rice +9.5', 'Army -3', 'Utah -27.5', 'Fresno St -6.5',
    'Miss St +3.5', 'NC State +3.5', 'New Mexico +22.5', 'Louisville -1.5', 'Texas A&M', 'Kansas St PK'];
  const app = await built(t, names);
  app.$('#copyEntry1').click();
  await wait(20);
  const lines = app.window.__clipboard.split('\n');
  assert.equal(lines[0], 'Splash Entry 1');
  assert.deepEqual(lines.slice(1).map(l => l.replace(/^\d+\. /, '')), app.entry(1));
});

test('entry header shows the favorite/underdog mix', async t => {
  const names = ['A +1.5', 'B +2.5', 'C +3.5', 'D +4.5', 'E -1.5', 'F -2.5', 'G -3.5', 'H -4.5', 'I PK', 'J +5.5', 'K -5.5'];
  const app = await built(t, names, 3);
  for (const n of [1, 2]) {
    const picks = app.entry(n);
    const dogs = picks.filter(p => p.includes('+')).length;
    const favs = picks.filter(p => / -/.test(p)).length;
    const mix = app.$('#entry' + n + 'Mix').textContent;
    if (dogs) assert.match(mix, new RegExp(dogs + ' dog'));
    if (favs) assert.match(mix, new RegExp(favs + ' fav'));
  }
});
