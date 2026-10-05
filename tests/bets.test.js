// Bet Tracker page: tabs, bet entry, import, auto-grading from scores, undo, sync, and Help.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, createBackend, espnFeed, teamNames, wait } = require('./helpers');

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const Y = day(-1);

const GAMES = [
  { date: Y, home: ['West Virginia', 'WVU', 24], away: ['Kansas', 'KU', 27] },          // WVU +3.5 -> W
  { date: Y, home: ['USC', 'USC', 35], away: ['Michigan State', 'MSU', 28] },           // USC -9.5 -> L
  { date: Y, home: ['Army', 'ARMY', 21], away: ['Tulsa', 'TLSA', 19] },                 // Army -2 -> Push
  { date: Y, home: ['Ohio State', 'OSU', 31], away: ['Illinois', 'ILL', 20], final: false }, // not final
  { date: Y, home: ['Colorado State', 'CSU', 17], away: ['San Jose State', 'SJSU', 20] }, // decoy for "Colorado"
  { date: day(0), home: ['Colorado', 'COLO', 28], away: ['BYU', 'BYU', 35] },           // late game next day: +13.5 -> W
  { date: Y, home: ['Utah State', 'USU', 10], away: ['Boise State', 'BSU', 38] }         // Over 45.5 -> W (48)
];
const espn = () => ({ feed: espnFeed(GAMES), calls: [] });

async function open(t, opts = {}) {
  const app = openApp(opts);
  t.after(app.close);
  await wait(30);
  return app;
}
const tabTo = (app, name) => app.$(name === 'bets' ? '#tabBets' : '#tabPool').click();
const rows = app => app.$$('#btBody tr');
const rowFor = (app, bet) => rows(app).find(tr => tr.querySelector('[data-f="bet"]').value === bet);
const val = (tr, f) => tr.querySelector('[data-f="' + f + '"]').value;
function edit(app, tr, f, value) {
  const el = tr.querySelector('[data-f="' + f + '"]');
  el.value = value;
  el.dispatchEvent(new app.window.Event('change', { bubbles: true }));
}
function addBet(app, text, date = Y) {
  app.$('#btAddBtn').click();
  const tr = rows(app).find(r => val(r, 'bet') === '');
  edit(app, tr, 'bet', text);
  edit(app, tr, 'date', date);
  return tr;
}
const stored = app => JSON.parse(app.window.localStorage.getItem('cfb-pool-bets-v1'));

test('tabs switch pages, hide pool-only buttons, and #bets opens the tracker directly', async t => {
  const app = await open(t);
  assert.equal(app.$('#betsPage').hidden, true);
  assert.equal(app.$('#tabPool').getAttribute('aria-selected'), 'true');
  tabTo(app, 'bets');
  assert.equal(app.$('#betsPage').hidden, false);
  assert.equal(app.$('#poolPage').hidden, true);
  assert.equal(app.$('#tabBets').getAttribute('aria-selected'), 'true');
  assert.ok(app.doc.body.classList.contains('on-bets'));
  assert.equal(app.window.location.hash, '#bets');
  assert.ok(app.$('#historyBtn').classList.contains('pool-only'));
  tabTo(app, 'pool');
  assert.equal(app.$('#poolPage').hidden, false);

  const direct = await open(t, { url: 'https://pool.test/#bets' });
  assert.equal(direct.$('#betsPage').hidden, false, 'a #bets bookmark lands on the tracker');
});

test('arrow keys move between the tabs', async t => {
  const app = await open(t);
  app.$('#tabPool').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(app.$('#betsPage').hidden, false);
  assert.equal(app.doc.activeElement, app.$('#tabBets'));
});

test('a new bet defaults to -110 to win one unit, and odds/risk/win/units stay linked', async t => {
  const app = await open(t);
  tabTo(app, 'bets');
  const tr = addBet(app, 'Temple +6.5');
  assert.equal(val(tr, 'odds'), '-110');
  assert.equal(val(tr, 'risk'), '33.00');
  assert.equal(val(tr, 'win'), '30.00');
  assert.equal(val(tr, 'units'), '1.10');
  edit(app, tr, 'win', '20');
  assert.equal(val(tr, 'odds'), '-165', 'odds come from risk and win');
  edit(app, tr, 'odds', '+150');
  assert.equal(val(tr, 'win'), '49.50');
  edit(app, tr, 'units', '2');
  assert.equal(val(tr, 'risk'), '60.00');
  assert.equal(val(tr, 'win'), '90.00');
  assert.equal(stored(app).bets[0].bet, 'Temple +6.5', 'saved in this browser');
});

test('pasting rows from the sheet imports bets and ignores title rows', async t => {
  const app = await open(t);
  tabTo(app, 'bets');
  const paste = 'Bet Tracker\t\t\nUnit size ($):\t$30\nRecord:\t0-0-0\t\t\tTotal prof\t-\n\n' +
    'Date\tBet\tOdds (American)\tRisk ($)\tWin ($)\tUnits\tWhere placed\tResult\tProfit/Loss ($)\tNotes\n' +
    Y + '\tWest Va +3.5\t-110\t$33.00\t$30.00\t1.10\tMyB\t\t\t\n' +
    '\tAriz St -3.5\t-110\t$36.71\t$33.29\t1.22\tKalshi\t\t\t\n' +
    '\tMiss St +6.5\t+102\t$98.87\t$101.13\t3.30\tKalshi\tW\t\tlean\n';
  app.$('#btDataBtn').click();
  app.$('#btDataMenu [data-act="import"]').click();
  assert.ok(!app.$('#btImportOverlay').classList.contains('hidden'));
  app.$('#btImportText').value = paste;
  app.$('#btImportGo').click();
  assert.equal(rows(app).length, 3);
  const ms = rowFor(app, 'Miss St +6.5');
  assert.equal(val(ms, 'odds'), '+102');
  assert.equal(val(ms, 'result'), 'W');
  assert.equal(val(ms, 'date'), Y, 'blank dates take the date above');
  assert.equal(val(rowFor(app, 'Ariz St -3.5'), 'win'), '33.29');
  assert.equal(app.$('#btRec').textContent, '1-0-0');
  assert.equal(app.$('#btNet').textContent, '$101.13');
});

test('Auto-grade fills in W, L, and Push from final scores and leaves unfinished games pending', async t => {
  const feed = espn();
  const app = await open(t, { espn: feed });
  tabTo(app, 'bets');
  ['West Va +3.5', 'USC -9.5', 'Army -2', 'Ohio St -13.5', 'Colorado +13.5', 'Utah St Over 45.5', 'Nowhere Tech +7'].forEach(b => addBet(app, b));
  app.$('#btGradeBtn').click();
  await wait(400);
  const res = b => val(rowFor(app, b), 'result');
  assert.equal(res('West Va +3.5'), 'W');
  assert.equal(res('USC -9.5'), 'L');
  assert.equal(res('Army -2'), 'P');
  assert.equal(res('Colorado +13.5'), 'W', 'matches Colorado, not Colorado State, and finds the late game');
  assert.equal(res('Utah St Over 45.5'), 'W');
  assert.equal(res('Ohio St -13.5'), '');
  assert.match(rowFor(app, 'Ohio St -13.5').querySelector('.bt-fin').textContent, /Not final/);
  assert.match(rowFor(app, 'Nowhere Tech +7').querySelector('.bt-fin').textContent, /not found/i);
  assert.match(rowFor(app, 'West Va +3.5').querySelector('.bt-fin').textContent, /WVU 24-27 KU/);
  assert.equal(app.$('#btRec').textContent, '3-1-1');
  assert.match(app.$('#btMsgText').textContent, /Graded 5 bets/);
  assert.ok(feed.calls.length <= 4, 'one scoreboard request covers the day (plus an FCS check for the miss): ' + feed.calls.length);
});

test('results set by hand are never overwritten, and editing a bet clears an automatic result', async t => {
  const app = await open(t, { espn: espn() });
  tabTo(app, 'bets');
  const manual = addBet(app, 'USC -9.5');
  edit(app, manual, 'result', 'W');
  const auto = addBet(app, 'West Va +3.5');
  app.$('#btGradeBtn').click();
  await wait(300);
  assert.equal(val(manual, 'result'), 'W', 'hand-set result kept');
  assert.equal(val(auto, 'result'), 'W');
  edit(app, auto, 'bet', 'West Va -10');
  assert.equal(val(auto, 'result'), '', 'auto result cleared when the bet changes');
  app.$('#btGradeBtn').click();
  await wait(300);
  assert.equal(val(rowFor(app, 'West Va -10'), 'result'), 'L');
});

test('a failed connection to ESPN says so and changes nothing', async t => {
  const app = await open(t); // no espn feed = network down
  tabTo(app, 'bets');
  addBet(app, 'Army -2');
  app.$('#btGradeBtn').click();
  await wait(200);
  assert.match(app.$('#btMsgText').textContent, /reach ESPN/);
  assert.equal(val(rowFor(app, 'Army -2'), 'result'), '');
});

test('deleting a bet can be undone from the message', async t => {
  const app = await open(t);
  tabTo(app, 'bets');
  addBet(app, 'Army -2');
  addBet(app, 'Temple +6.5');
  rowFor(app, 'Army -2').querySelector('[data-del]').click();
  assert.equal(rows(app).length, 1);
  assert.match(app.$('#btMsgText').textContent, /Deleted/);
  app.$('#btMsgBtn').click();
  assert.equal(rows(app).length, 2);
  assert.ok(rowFor(app, 'Army -2'));
});

test('Ctrl+Z on the Bet Tracker page leaves the pool build alone', async t => {
  const app = await open(t);
  app.loadTeams(teamNames(12));
  tabTo(app, 'bets');
  app.keyUndo();
  tabTo(app, 'pool');
  assert.equal(app.$$('.team-row').length, 12);
});

test('bets sync between devices: adds, edits, and deletes', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  const phone = await open(t, { backend });
  tabTo(laptop, 'bets');
  addBet(laptop, 'Army -2');
  addBet(laptop, 'Temple +6.5');
  await wait(900);
  assert.equal(backend.bets.bets.length, 2);
  assert.equal(backend.data, null, 'bets never touch the pool setup');

  phone.becomeVisible();
  await wait(200);
  tabTo(phone, 'bets');
  assert.equal(rows(phone).length, 2);
  assert.match(phone.$('#btSync').textContent, /synced/i);

  phone.$('#btBody tr').querySelector('[data-del]').click(); // newest first: Temple
  edit(phone, rowFor(phone, 'Army -2'), 'notes', 'from phone');
  await wait(900);

  laptop.becomeVisible();
  await wait(200);
  assert.equal(rows(laptop).length, 1, 'delete reached the laptop');
  assert.equal(val(rowFor(laptop, 'Army -2'), 'notes'), 'from phone', 'edit reached the laptop');
});

test('a sync never brings back a bet deleted on this device', async t => {
  const backend = createBackend();
  const a = await open(t, { backend });
  const b = await open(t, { backend });
  tabTo(a, 'bets');
  addBet(a, 'Army -2');
  await wait(900);
  b.becomeVisible(); await wait(200);
  tabTo(b, 'bets');
  b.$('#btBody tr [data-del]').click();
  await wait(900);
  a.becomeVisible(); await wait(200);
  assert.equal(rows(a).length, 0);
  await wait(900);
  b.becomeVisible(); await wait(200);
  assert.equal(rows(b).length, 0, 'the older copy on the laptop did not resurrect it');
});

test('pool setup sync still works alongside bet sync', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  laptop.loadTeams(teamNames(8));
  tabTo(laptop, 'bets');
  addBet(laptop, 'Army -2');
  await wait(900);
  assert.equal(backend.data.teams.length, 8);
  assert.equal(backend.bets.bets.length, 1);
  const phone = await open(t, { backend });
  await wait(200);
  assert.equal(phone.$$('.team-row').length, 8);
});

test('a backup from the standalone Bet Tracker loads, and loading it again updates instead of duplicating', async t => {
  const app = await open(t);
  tabTo(app, 'bets');
  const backup = JSON.stringify({ app: 'bet-tracker', version: 2, settings: { unit: 25, league: 'cfb', autoGrade: true },
    bets: [{ id: 'abc', date: Y, bet: 'Army -2', odds: -110, risk: 27.5, win: 25, book: 'MyB', result: 'P', auto: true, final: 'ARMY 21-19 TLSA', notes: '' }] });
  for (let i = 0; i < 2; i++) {
    app.$('#btDataBtn').click();
    app.$('#btDataMenu [data-act="import"]').click();
    app.$('#btImportText').value = backup;
    app.$('#btImportGo').click();
  }
  assert.equal(rows(app).length, 1);
  assert.match(app.$('#btMsgText').textContent, /0 added, 1 updated/);
  assert.equal(app.$('#btUnit').value, '25');
  assert.equal(val(rowFor(app, 'Army -2'), 'units'), '1.10');
});

test('every button named in the Bet Tracker help exists on the page', async t => {
  const app = await open(t);
  const section = [];
  let node = app.$('#helpBets');
  while (node && !(node.matches('.help-h') && node.textContent === 'Common questions')) { section.push(node); node = node.nextElementSibling; }
  const mentioned = section.flatMap(n => Array.from(n.querySelectorAll('strong'))).map(e => e.textContent.replace(/\.$/, ''));
  const uiText = [...app.$$('button'), ...app.$$('summary'), ...app.$$('.field-label')].filter(e => !e.closest('#helpOverlay')).map(e => e.textContent.trim());
  for (const label of ['Bet Tracker', 'Pool Builder', 'Settings', '+ Add bet', 'Auto-grade', 'Data']) {
    assert.ok(mentioned.includes(label), 'Help should mention "' + label + '"');
    assert.ok(uiText.some(text => text.startsWith(label)), '"' + label + '" should exist on the page');
  }
});

test('a sync that arrives while you are typing keeps your cursor and unfinished text', async t => {
  const backend = createBackend();
  const laptop = await open(t, { backend });
  const phone = await open(t, { backend });
  tabTo(laptop, 'bets');
  addBet(laptop, 'Army -2');
  await wait(900);
  phone.becomeVisible(); await wait(200);
  tabTo(phone, 'bets');
  addBet(phone, 'Temple +6.5');
  await wait(900);
  const notes = rowFor(laptop, 'Army -2').querySelector('[data-f="notes"]');
  notes.focus();
  notes.value = 'half-typed';
  laptop.becomeVisible(); await wait(200);
  assert.equal(rows(laptop).length, 2, 'the phone bet arrived');
  const active = laptop.doc.activeElement;
  assert.equal(active.dataset.f, 'notes');
  assert.equal(active.closest('tr').querySelector('[data-f="bet"]').value, 'Army -2');
  assert.equal(active.value, 'half-typed');
});
