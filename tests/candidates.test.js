const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function setup(t, names = teamNames(12)) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(names);
  return app;
}

test('new teams default to Lean', async t => {
  const app = await setup(t);
  assert.ok(teamNames(12).every(n => app.tierOf(n) === 2));
  assert.deepEqual(app.dividers(), ['Lean']);
});

test('list is grouped by tier with a divider per non-empty tier, in tier order', async t => {
  const app = await setup(t);
  app.setTier('Team5', 0);
  app.setTier('Team9', 1);
  app.setTier('Team0', 3);
  assert.deepEqual(app.dividers(), ['Lock', 'Strong', 'Lean', 'Meh']);
  const order = app.candidateOrder();
  assert.equal(order[0], 'Team5');
  assert.equal(order[1], 'Team9');
  assert.equal(order[order.length - 1], 'Team0');
});

test('arrows move a team within its tier only, and disable at the tier edges', async t => {
  const app = await setup(t);
  app.setTier('Team0', 0);
  app.setTier('Team1', 0);
  app.setTier('Team2', 1); // alone in Strong
  assert.equal(app.arrow('Team2', 'up').disabled, true);
  assert.equal(app.arrow('Team2', 'down').disabled, true);
  assert.equal(app.arrow('Team0', 'up').disabled, true);
  app.arrow('Team0', 'down').click();
  assert.deepEqual(app.candidateOrder().slice(0, 3), ['Team1', 'Team0', 'Team2']);
});

test('drag reorders within a tier but does nothing across tiers', async t => {
  const app = await setup(t);
  app.setTier('Team0', 0);
  app.setTier('Team1', 0);
  app.setTier('Team11', 3);
  const before = app.candidateOrder();
  app.dragOnto('Team0', 'Team11');
  assert.deepEqual(app.candidateOrder(), before, 'cross-tier drop ignored');
  app.dragOnto('Team1', 'Team0', true);
  assert.deepEqual(app.candidateOrder().slice(0, 2), ['Team1', 'Team0']);
});

test('reloading the team list keeps settings for teams that are still there', async t => {
  const app = await setup(t);
  app.setTier('Team3', 0);
  app.place('Team4', 1);
  app.loadTeams(teamNames(12).concat(['Team12']));
  assert.equal(app.tierOf('Team3'), 0);
  assert.equal(app.row('Team4').querySelector('.place-btn[data-mask="1"]').classList.contains('active'), true);
  assert.equal(app.tierOf('Team12'), 2);
});

test('spreads are parsed for display without changing the stored name', async t => {
  const names = ['Purdue +14.5', 'Va Tech -2.5', 'Kansas St PK', 'Texas A&M', 'Army -3', 'Rice +9.5',
    'Utah -27.5', 'Fresno St -6.5', 'Miss St +3.5', 'NC State +3.5', 'New Mexico +22.5', 'Louisville -1.5'];
  const app = await setup(t, names);
  const chip = name => app.row(name).querySelector('.spread');
  assert.equal(chip('Purdue +14.5').className, 'spread spread-dog');
  assert.equal(chip('Va Tech -2.5').className, 'spread spread-fav');
  assert.equal(chip('Kansas St PK').textContent, 'PK');
  assert.equal(chip('Army -3').className, 'spread spread-fav');
  assert.equal(chip('Texas A&M'), null, 'no line, no chip');
  assert.equal(app.row('Purdue +14.5').querySelector('.name-text').textContent, 'Purdue');
  assert.deepEqual(app.candidateOrder(), names, 'stored names unchanged');
});
