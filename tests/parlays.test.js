// Bet Tracker: parlays and teasers (legs, auto-grading each leg, push rules, payouts, summary).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, createBackend, espnFeed, wait, SYNC_WAIT } = require('./helpers');

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const Y = day(-1);
const GAMES = [
  { date: Y, home: ['West Virginia', 'WVU', 24], away: ['Kansas', 'KU', 27] },          // WVU +3.5 W; Kansas -9 teased 6 -> -3 push
  { date: Y, home: ['USC', 'USC', 35], away: ['Michigan State', 'MSU', 28] },           // USC -9.5 L; teased 6 -> -3.5 W
  { date: Y, home: ['Army', 'ARMY', 21], away: ['Tulsa', 'TLSA', 19] },                 // Army -2 push
  { date: Y, home: ['Ohio State', 'OSU', 31], away: ['Illinois', 'ILL', 20], final: false }, // not final
  { date: Y, home: ['Utah State', 'USU', 10], away: ['Boise State', 'BSU', 38] }         // 48 total: Over 45.5 W; Under 45.5 teased 6 -> 51.5 W
];
const espn = () => ({ feed: espnFeed(GAMES), calls: [] });

async function open(t, opts = {}) {
  const app = openApp(Object.assign({ espn: espn(), url: 'https://pool.test/#bets' }, opts));
  t.after(app.close);
  await wait(30);
  return app;
}
const rows = app => app.$$('#btBody tr');
const legRows = app => app.$$('#btLegsList .bt-leg');
function fire(app, el, value) {
  el.value = String(value);
  el.dispatchEvent(new app.window.Event('change', { bubbles: true }));
}
function setLeg(app, i, field, value) { fire(app, legRows(app)[i].querySelector('[data-lf="' + field + '"]'), value); }
function rowField(tr, f) { return tr.querySelector('[data-f="' + f + '"]'); }
// Adds a parlay (or teaser) dated yesterday with the given legs; leaves the editor open.
function addMulti(app, legs, { teaser = 0, push = 'drop', odds = null } = {}) {
  app.$('#btAddMultiBtn').click();
  const tr = rows(app).find(r => r.querySelector('[data-legs]') && !r.dataset.used);
  tr.dataset.used = '1';
  fire(app, rowField(tr, 'date'), Y);
  if (teaser) { fire(app, app.$('#btLegsKind'), 'teaser'); fire(app, app.$('#btLegsPts'), teaser); }
  fire(app, app.$('#btLegsPush'), push);
  legs.forEach((leg, i) => {
    if (i >= legRows(app).length) app.$('#btLegsAdd').click();
    const [text, legOdds] = Array.isArray(leg) ? leg : [leg, null];
    setLeg(app, i, 'bet', text);
    if (legOdds != null) setLeg(app, i, 'odds', legOdds);
  });
  if (odds != null) fire(app, rowField(tr, 'odds'), odds);
  return tr;
}
const done = app => app.$('#btLegsDone').click();
const grade = async app => { app.$('#btGradeBtn').click(); await wait(250); };
const pl = tr => tr.querySelector('.bt-pl').textContent;
const stored = app => JSON.parse(app.window.localStorage.getItem('cfb-pool-bets-v1'));

test('+ Parlay / teaser adds a 2-leg parlay and opens its legs', async t => {
  const app = await open(t);
  app.$('#btAddMultiBtn').click();
  assert.ok(!app.$('#btLegsOverlay').classList.contains('hidden'));
  assert.equal(legRows(app).length, 2);
  const tr = rows(app)[0];
  assert.equal(rowField(tr, 'bet').value, '2-leg parlay');
  assert.equal(rowField(tr, 'odds').value, '+264', 'two -110 legs');
  assert.match(tr.querySelector('[data-legs]').textContent, /^Parlay · 2 legs/);
  app.$('#btLegsAdd').click();
  setLeg(app, 2, 'bet', 'Army -2');
  assert.equal(rowField(tr, 'bet').value, '3-leg parlay', 'the label follows the legs until you type your own');
  done(app);
  assert.ok(app.$('#btLegsOverlay').classList.contains('hidden'));
});

test('a parlay is graded leg by leg and wins only when every leg wins', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['West Virginia +3.5', 'Boise State Over 45.5']);
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'W');
  assert.equal(tr.className.split(' ')[0], 'W');
  assert.equal(pl(tr), '$' + rowField(tr, 'win').value);
  assert.equal(tr.querySelectorAll('.bt-legdots i.W').length, 2);
  assert.match(tr.querySelector('.bt-fin').textContent, /All 2 legs won/);
});

test('one losing leg loses the parlay right away, even with another leg still playing', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['Ohio State -3', 'USC -9.5']);
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'L');
  assert.match(tr.querySelector('.bt-fin').textContent, /Lost: USC -9\.5 \(USC 35-28 MSU\)/);
  assert.equal(pl(tr), '-$30.00');
});

test('a pushed parlay leg drops out and the parlay pays on the rest at their prices', async t => {
  const app = await open(t);
  const tr = addMulti(app, [['West Virginia +3.5', -110], ['Army -2', -110], ['Boise State Over 45.5', 100]]);
  fire(app, rowField(tr, 'risk'), 10);
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'W');
  // 10 x (1.9091 x 2.0) - 10 = 28.18
  assert.equal(pl(tr), '$28.18');
  assert.match(tr.querySelector('.bt-fin').textContent, /1 leg pushed and dropped; paid on 2 legs/);
});

test('"Bet loses" on a push grades the bet a loss', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['West Virginia +3.5', 'Army -2'], { push: 'lose' });
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'L');
});

test('a 6-point teaser grades each leg at the teased number', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['USC -9.5', 'Boise State Under 45.5'], { teaser: 6, odds: -120 });
  assert.match(legRows(app)[0].querySelector('.bt-leg-sub').textContent, /Graded as USC -3\.5/);
  assert.match(legRows(app)[1].querySelector('.bt-leg-sub').textContent, /Graded as Boise State Under 51\.5/);
  assert.equal(rowField(tr, 'bet').value, '2-leg 6-pt teaser');
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'W');
  assert.equal(rowField(tr, 'odds').value, '-120');
  assert.match(tr.querySelector('[data-legs]').textContent, /^Teaser 6-pt · 2 legs/);
});

test('a 2-leg teaser with a push left on one leg pays as a straight bet at -110', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['USC -9.5', 'Kansas -9'], { teaser: 6, odds: -120 }); // Kansas -3 pushes
  fire(app, rowField(tr, 'risk'), 33);
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'W');
  assert.equal(pl(tr), '$30.00');
});

test('a bigger teaser with a push asks what the book paid, and uses it', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['USC -9.5', 'Kansas -9', 'Boise State Under 45.5'], { teaser: 6, odds: 160 });
  done(app);
  await grade(app);
  assert.equal(rowField(tr, 'result').value, 'W');
  assert.match(tr.querySelector('.bt-fin').textContent, /^! 1 leg pushed and dropped/);
  tr.querySelector('[data-legs]').click();
  assert.ok(!app.$('#btLegsPaidWrap').hidden);
  fire(app, app.$('#btLegsPaid'), '27.50');
  done(app);
  assert.equal(pl(tr), '$27.50');
  assert.doesNotMatch(tr.querySelector('.bt-fin').textContent, /^!/);
  assert.equal(stored(app).bets.find(b => b.legs).paid, 27.5);
});

test('legs can be graded by hand, and a result set on the row by hand wins', async t => {
  const app = await open(t);
  const tr = addMulti(app, ['Team A -3', 'Team B +7']);
  setLeg(app, 0, 'result', 'W');
  assert.equal(rowField(tr, 'result').value, '', 'one leg still open');
  assert.match(app.$('#btLegsNote').textContent, /1 of 2 legs won so far/);
  setLeg(app, 1, 'result', 'L');
  assert.equal(rowField(tr, 'result').value, 'L');
  done(app);
  fire(app, rowField(tr, 'result'), 'W');
  assert.equal(rowField(tr, 'result').value, 'W');
  tr.querySelector('[data-legs]').click();
  setLeg(app, 0, 'result', 'L');
  assert.equal(rowField(tr, 'result').value, 'W', 'a hand result is kept');
});

test('Use this price sets the parlay odds from the legs', async t => {
  const app = await open(t);
  const tr = addMulti(app, [['A +3', 150], ['B -3', -200]], { odds: 300 });
  assert.equal(rowField(tr, 'odds').value, '+300');
  assert.match(app.$('#btLegsPrice').textContent, /Price from the legs: \+275/);
  app.$('#btLegsUsePrice').click();
  assert.equal(rowField(tr, 'odds').value, '+275');
});

test('parlays and teasers get their own rows in Results by type, and a filter', async t => {
  const app = await open(t);
  addMulti(app, ['West Virginia +3.5', 'Boise State Over 45.5']); done(app);
  addMulti(app, ['USC -9.5', 'Boise State Under 45.5'], { teaser: 6, odds: -120 }); done(app);
  app.$('#btAddBtn').click();
  const single = rows(app).find(r => !r.querySelector('[data-legs]'));
  fire(app, rowField(single, 'bet'), 'Army -2');
  fire(app, rowField(single, 'date'), Y);
  await grade(app);
  const types = app.$$('#btByType tbody tr').map(r => r.cells[0].textContent);
  assert.ok(types.includes('Parlay'));
  assert.ok(types.includes('Teaser'));
  assert.ok(types.includes('Spread'));
  fire(app, app.$('#btFilterResult'), 'multi');
  assert.equal(rows(app).filter(r => !r.hidden).length, 2);
});

test('single bets keep their stored shape; multi-leg bets store their legs', async t => {
  const app = await open(t);
  app.$('#btAddBtn').click();
  fire(app, rowField(rows(app)[0], 'bet'), 'Army -2');
  addMulti(app, ['A +3', 'B -3']); done(app);
  const bets = stored(app).bets;
  assert.equal('legs' in bets.find(b => b.bet === 'Army -2'), false);
  const multi = bets.find(b => b.legs);
  assert.deepEqual(multi.legs.map(l => l.bet), ['A +3', 'B -3']);
  assert.equal(multi.kind, 'parlay');
  assert.equal(multi.push, 'drop');
});

test('parlay legs sync to the other device', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  addMulti(laptop, ['A +3', 'B -3', 'C +1']); done(laptop);
  await wait(SYNC_WAIT);
  const phone = await open(t, { backend });
  await wait(200);
  const tr = phone.$$('#btBody tr').find(r => r.querySelector('[data-legs]'));
  assert.ok(tr);
  assert.match(tr.querySelector('[data-legs]').textContent, /3 legs/);
  tr.querySelector('[data-legs]').click();
  assert.deepEqual(phone.$$('#btLegsList [data-lf="bet"]').map(i => i.value), ['A +3', 'B -3', 'C +1']);
});

test('CSV export lists each leg', async t => {
  const app = await open(t);
  let csv = '';
  app.window.Blob = class { constructor(parts) { csv = parts.join(''); } };
  app.window.URL.createObjectURL = () => 'blob:x';
  app.window.URL.revokeObjectURL = () => {};
  addMulti(app, ['USC -9.5', 'Boise State Under 45.5'], { teaser: 6 }); done(app);
  app.$('#btDataBtn').click();
  app.$('#btDataMenu [data-act="csv"]').click();
  await wait(30);
  assert.match(csv, /2-leg 6-pt teaser: USC -3\.5 \| Boise State Under 51\.5/);
});
