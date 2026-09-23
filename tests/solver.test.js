const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function setup(t, count, overlap) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(count));
  app.setOverlap(overlap);
  return app;
}

test('every build has two 7-pick entries sharing exactly the chosen overlap', async t => {
  for (const overlap of [0, 3, 5, 7]) {
    const app = await setup(t, 14, overlap);
    for (let i = 0; i < 10; i++) {
      app.build();
      assert.equal(app.entry(1).length, 7, `entry 1 at overlap ${overlap}`);
      assert.equal(app.entry(2).length, 7, `entry 2 at overlap ${overlap}`);
      assert.equal(app.shared().length, overlap, `shared count at overlap ${overlap}`);
    }
  }
});

test('placements are always respected (S1, S2, lock both)', async t => {
  const app = await setup(t, 14, 3);
  app.place('Team5', 1);
  app.place('Team6', 3);
  app.place('Team7', 2);
  for (let i = 0; i < 25; i++) {
    app.build();
    assert.ok(app.entry(1).includes('Team5') && !app.entry(2).includes('Team5'), 'Team5 only in entry 1');
    assert.ok(app.entry(1).includes('Team6') && app.entry(2).includes('Team6'), 'Team6 in both');
    assert.ok(app.entry(2).includes('Team7') && !app.entry(1).includes('Team7'), 'Team7 only in entry 2');
  }
});

test('exposure limits are always respected', async t => {
  const app = await setup(t, 14, 3);
  app.setExposure('Team0', 'max', 0);
  app.setExposure('Team1', 'min', 2);
  for (let i = 0; i < 25; i++) {
    app.build();
    assert.ok(!app.entry(1).includes('Team0') && !app.entry(2).includes('Team0'), 'max 0 means never picked');
    assert.ok(app.shared().includes('Team1'), 'min 2 means in both entries');
  }
});

test('tiers: Lock teams take the shared slots and Meh is benched when the pool is deep', async t => {
  const app = await setup(t, 14, 3);
  ['Team0', 'Team1', 'Team2'].forEach(n => app.setTier(n, 0));
  ['Team3', 'Team4', 'Team5', 'Team6', 'Team7'].forEach(n => app.setTier(n, 1));
  app.setTier('Team13', 3);
  for (let i = 0; i < 60; i++) {
    app.build();
    assert.deepEqual([...app.shared()].sort(), ['Team0', 'Team1', 'Team2']);
    assert.ok(!app.entry(1).includes('Team13') && !app.entry(2).includes('Team13'), 'Meh benched');
  }
});

test('tiers: Meh teams are still used when the pool needs them', async t => {
  const app = await setup(t, 8, 6); // 8 teams, 8 unique slots: every team is required
  app.setTier('Team0', 0);
  app.setTier('Team7', 3);
  for (let i = 0; i < 20; i++) {
    app.build();
    const used = new Set(app.entry(1).concat(app.entry(2)));
    assert.ok(used.has('Team7'), 'Meh team included when required');
    assert.equal(used.size, 8);
  }
});

test('tiers: teams in the same tier are rotated build to build', async t => {
  const app = await setup(t, 14, 3);
  // All 14 are Lean by default; 11 unique slots, so 3 are benched each build.
  const benched = new Set();
  for (let i = 0; i < 60; i++) {
    app.build();
    const used = new Set(app.entry(1).concat(app.entry(2)));
    teamNames(14).forEach(n => { if (!used.has(n)) benched.add(n); });
  }
  assert.ok(benched.size >= 8, `expected variety in who gets benched, got ${benched.size} distinct teams`);
});

test('build is blocked with a clear message when the setup is impossible', async t => {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  app.loadTeams(teamNames(5));
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.match(app.status(), /at least 7/);

  app.loadTeams(teamNames(10));
  app.setOverlap(3); // needs 11 unique teams
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.match(app.status(), /Not enough usable teams/);
});
