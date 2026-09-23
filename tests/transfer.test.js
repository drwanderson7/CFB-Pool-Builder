const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

test('a copied setup code loads the same teams, tiers, overlap, and build elsewhere', async t => {
  const source = openApp();
  t.after(source.close);
  await wait(20);
  source.loadTeams(teamNames(12));
  source.setTier('Team2', 0);
  source.setOverlap(4);
  source.build();
  source.$('#transferBtn').click();
  const code = source.$('#transferOut').value;

  const target = openApp();
  t.after(target.close);
  await wait(20);
  target.$('#transferBtn').click();
  target.$('#transferIn').value = code;
  target.$('#loadSetupBtn').click();
  assert.deepEqual(target.candidateOrder(), source.candidateOrder());
  assert.equal(target.tierOf('Team2'), 0);
  assert.equal(target.$('#overlapValue').textContent, '4');
  assert.deepEqual(target.entry(1), source.entry(1));
});

test('an invalid code shows an error and changes nothing', async t => {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  app.$('#transferBtn').click();
  app.$('#transferIn').value = 'not a setup {{';
  app.$('#loadSetupBtn').click();
  assert.match(app.status(), /Could not load setup/);
  assert.equal(app.$$('.team-row').length, 12);
});

test('loading over existing teams asks first, and cancel keeps them', async t => {
  const other = openApp();
  t.after(other.close);
  await wait(20);
  other.loadTeams(['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10', 'X11']);
  other.$('#transferBtn').click();
  const code = other.$('#transferOut').value;

  let asked = false;
  const app = openApp({ confirm: () => { asked = true; return false; } });
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(12));
  app.$('#transferBtn').click();
  app.$('#transferIn').value = code;
  app.$('#loadSetupBtn').click();
  assert.equal(asked, true);
  assert.equal(app.candidateOrder()[0], 'Team0');
});
