// Overlap fix button, benched list, and the Help guide.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

async function open(t, opts) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(20);
  return app;
}
const fixButton = app => app.$('#statusBox .status-action');

// ---------- Overlap fix ----------

test('too few teams for the overlap offers a one-tap fix that makes the setup buildable', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(10)); // default overlap 3 needs 11 teams
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.match(app.status(), /needs at least 11 teams with Max above 0, and you have 10/);
  assert.equal(fixButton(app).textContent, 'Set overlap to 4');

  fixButton(app).click();
  assert.equal(app.$('#overlapValue').textContent, '4');
  assert.equal(app.$('#buildBtn').disabled, false);
  app.build();
  assert.equal(app.entry(1).length, 7);
  assert.equal(app.shared().length, 4);
});

test('the suggested overlap is the smallest one that works', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(8));
  assert.equal(fixButton(app).textContent, 'Set overlap to 6'); // 8 teams = 14 - 6 unique slots
});

test('no fix button when overlap cannot help (fewer than 7 teams)', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(5));
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.equal(fixButton(app), null);
  assert.match(app.status(), /at least 7/);
});

test('too many teams locked in both offers a fix', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  app.setOverlap(1);
  app.place('Team0', 3);
  app.place('Team1', 3); // 2 locked in both > overlap 1: rejected as a new problem
  assert.match(app.status(), /locked in both/);
  assert.equal(app.row('Team1').querySelector('.place-btn[data-mask="3"]').classList.contains('active'), false);
});

test('a pool that is too small no longer blocks unrelated edits', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(10)); // unbuildable at overlap 3
  app.setTier('Team4', 0);
  assert.equal(app.tierOf('Team4'), 0, 'tier change accepted');
  app.setExposure('Team2', 'max', 1);
  assert.ok(app.row('Team2').querySelector('.exposure-btn[data-field="max"][data-value="1"]').classList.contains('active'));
  assert.equal(app.$('#buildBtn').disabled, true);
  assert.ok(fixButton(app), 'the explanation and fix stay visible after the edit');
});

test('a change that introduces a new problem is still rolled back', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  for (let i = 0; i < 7; i++) app.place('Team' + i, 1);
  app.place('Team7', 1); // 8th fixed pick in one entry
  assert.match(app.status(), /Too many fixed picks/);
  assert.equal(app.row('Team7').querySelector('.place-btn[data-mask="1"]').classList.contains('active'), false);
});

// ---------- Benched ----------

test('benched list is hidden until a build, then lists exactly the teams left out', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  assert.equal(app.$('#benchedBox').classList.contains('hidden'), true);
  app.build();
  assert.equal(app.$('#benchedBox').classList.contains('hidden'), false);
  const used = new Set(app.entry(1).concat(app.entry(2)));
  const expected = teamNames(14).filter(n => !used.has(n)).sort();
  const shown = app.$$('#benchedList .bench-chip').map(c => c.title.split(' \u2014 ')[0]).sort();
  assert.deepEqual(shown, expected);
  assert.equal(app.$('#benchedCount').textContent, expected.length + ' teams');
});

test('benched teams are ordered by tier and labeled with it', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  ['Team0', 'Team1', 'Team2'].forEach(n => app.setTier(n, 0));
  app.setTier('Team13', 3);
  app.setTier('Team12', 3);
  app.setTier('Team11', 3);
  app.setTier('Team10', 3);
  for (let i = 0; i < 5; i++) {
    app.build();
    const labels = app.$$('#benchedList .bench-tier').map(e => e.textContent);
    const rank = { Lock: 0, Strong: 1, Lean: 2, Meh: 3 };
    assert.deepEqual(labels, [...labels].sort((a, b) => rank[a] - rank[b]), 'sorted by tier');
    assert.ok(labels.length === 3 && labels.every(l => l === 'Meh'), labels.join());
  }
});

test('a team benched by Max 0 is tagged, and the list hides when everyone is used', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  app.setExposure('Team5', 'max', 0);
  app.build();
  const chip = app.$$('#benchedList .bench-chip').find(c => c.title.startsWith('Team5'));
  assert.ok(chip && /Max 0/.test(chip.textContent));

  const full = await open(t);
  full.loadTeams(teamNames(8));
  full.setOverlap(6); // all 8 teams required
  full.build();
  assert.equal(full.$('#benchedBox').classList.contains('hidden'), true);
});

test('benched list follows edits (moving a pick) and Start new week hides it', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  app.build();
  const before = app.$$('#benchedList .bench-chip').length;
  app.$('#resetBtn').click();
  assert.equal(app.$('#benchedBox').classList.contains('hidden'), true);
  app.$('#undoBtn').click();
  assert.equal(app.$$('#benchedList .bench-chip').length, before);
});

// ---------- Help ----------

test('Help opens from the top bar and closes with the X, outside click, or Escape', async t => {
  const app = await open(t);
  const overlay = app.$('#helpOverlay');
  assert.equal(overlay.classList.contains('hidden'), true);
  app.$('#helpBtn').click();
  assert.equal(overlay.classList.contains('hidden'), false);
  app.$('#helpCloseBtn').click();
  assert.equal(overlay.classList.contains('hidden'), true);

  app.$('#helpBtn').click();
  overlay.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
  assert.equal(overlay.classList.contains('hidden'), true);

  app.$('#helpBtn').click();
  app.doc.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('Escape closes the other pop-ups too', async t => {
  const app = await open(t);
  for (const id of ['#historyBtn', '#transferBtn']) {
    app.$(id).click();
    app.doc.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(app.$$('.modal-overlay:not(.hidden)').length, 0, id);
  }
});

test('Help covers steps, outputs, features, and FAQ', async t => {
  const app = await open(t);
  const headings = app.$$('#helpOverlay .help-h').map(h => h.textContent);
  assert.deepEqual(headings, ['Quick start', 'What you get', 'Key features', 'Bet Tracker', 'Common questions']);
  assert.ok(app.$$('#helpOverlay .help-steps li').length >= 8);
  assert.ok(app.$$('#helpOverlay .faq').length >= 8);
});

test('every button named in the Help steps exists in the tool (Help stays in sync with the UI)', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(14));
  app.place('Team0', 1); // a locked pick, so Unlock and Move to are on screen after building
  app.build();
  const mentioned = app.$$('#helpOverlay .help-steps strong').map(e => e.textContent.replace(/\.$/, ''));
  const uiText = [...app.$$('button'), ...app.$$('h2'), ...app.$$('option'), ...app.$$('.field-label')]
    .filter(e => !e.closest('#helpOverlay')).map(e => e.textContent.trim().replace(/^\+\s*/, ''));
  const buttons = ['Load / update teams', 'Build 2 entries', 'Another valid build', 'Copy entry', 'Save this week', 'Saved weeks', 'Start new week', 'Undo', 'Move to', 'Unlock', 'Shared', 'Add a past week', 'Add pool', 'Copy its teams & tiers'];
  for (const label of buttons) {
    assert.ok(mentioned.includes(label), `Help should mention "${label}"`);
    assert.ok(uiText.some(text => text.startsWith(label)), `"${label}" should exist in the tool`);
  }
});
