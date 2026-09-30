// Keyboard/screen-reader access, color contrast, and the compact candidate rows used on phones.
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, teamNames, wait } = require('./helpers');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const STYLE = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];

async function open(t, count = 12) {
  const app = openApp();
  t.after(app.close);
  await wait(20);
  if (count) app.loadTeams(teamNames(count));
  return app;
}
const key = (app, target, opts) =>
  target.dispatchEvent(new app.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts }));

// ---------- Compact rows ----------

test('each candidate row has an Edit toggle and keeps its settings in a details wrapper', async t => {
  const app = await open(t);
  const row = app.row('Team0');
  const toggle = row.querySelector('.row-toggle');
  assert.equal(toggle.textContent, 'Edit');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  const details = row.querySelector('.row-details');
  assert.equal(details.querySelectorAll('.exposure-btn').length, 6);
  assert.equal(details.querySelectorAll('.place-btn').length, 3);
  assert.equal(row.querySelector('.tier-group').parentElement, row, 'tier stays visible outside the details');
});

test('Edit opens a row in place and the row stays open through re-renders', async t => {
  const app = await open(t);
  app.row('Team3').querySelector('.row-toggle').click();
  let row = app.row('Team3');
  assert.ok(row.classList.contains('expanded'));
  assert.equal(row.querySelector('.row-toggle').textContent, 'Done');
  assert.equal(row.querySelector('.row-toggle').getAttribute('aria-expanded'), 'true');

  app.setTier('Team3', 0);      // rebuilds the whole list and moves the row to another group
  row = app.row('Team3');
  assert.ok(row.classList.contains('expanded'), 'still open after the list re-rendered');
  assert.ok(!app.row('Team4').classList.contains('expanded'), 'other rows unaffected');

  row.querySelector('.row-toggle').click();
  assert.ok(!app.row('Team3').classList.contains('expanded'));
});

test('Expand all / Collapse all', async t => {
  const app = await open(t);
  const button = app.$('#expandAllBtn');
  assert.equal(button.textContent, 'Expand all');
  button.click();
  assert.ok(app.$$('.team-row').every(r => r.classList.contains('expanded')));
  assert.equal(button.textContent, 'Collapse all');
  app.row('Team0').querySelector('.row-toggle').click(); // one closed -> offer Expand all again
  assert.equal(button.textContent, 'Expand all');
  button.click();
  assert.ok(app.$$('.team-row').every(r => r.classList.contains('expanded')));
  button.click();
  assert.ok(app.$$('.team-row').every(r => !r.classList.contains('expanded')));
});

test('the Expand all control is hidden until teams are loaded', async t => {
  const app = await open(t, 0);
  assert.ok(app.$('#expandAllBtn').classList.contains('hidden'));
  app.loadTeams(teamNames(12));
  assert.ok(!app.$('#expandAllBtn').classList.contains('hidden'));
});

test('a collapsed row still shows what has been customized', async t => {
  const app = await open(t);
  const summary = name => app.row(name).querySelector('.row-summary').textContent;
  assert.equal(summary('Team0'), '', 'nothing custom, nothing shown');
  app.place('Team1', 1);
  assert.equal(summary('Team1'), 'In Entry 1');
  app.place('Team2', 3);
  assert.equal(summary('Team2'), 'Locked in both');
  app.setExposure('Team3', 'max', 1);
  assert.equal(summary('Team3'), 'Max 1');
  app.setExposure('Team4', 'min', 1);
  app.setExposure('Team4', 'max', 1);
  assert.equal(summary('Team4'), 'Min 1 \u00b7 Max 1');
});

test('phone-only rules exist and desktop keeps the one-line row', async () => {
  assert.match(STYLE, /\.row-toggle, \.expand-all \{ display: none; \}/);
  assert.match(STYLE, /\.row-details \{ display: contents; \}/);
  assert.match(STYLE, /@media \(max-width: 620px\)[\s\S]*?\.team-row\.expanded \.row-details/);
});

// ---------- Names and states for screen readers ----------

test('controls announce their team and their on/off state', async t => {
  const app = await open(t);
  app.place('Team0', 1);
  const row = app.row('Team0');
  const s1 = row.querySelector('.place-btn[data-mask="1"]');
  assert.equal(s1.getAttribute('aria-pressed'), 'true');
  assert.match(s1.getAttribute('aria-label'), /Team0 in Entry 1/);
  assert.equal(row.querySelector('.place-btn[data-mask="2"]').getAttribute('aria-pressed'), 'false');
  app.setExposure('Team5', 'max', 1);
  const maxButton = value => app.row('Team5').querySelector('.exposure-btn[data-field="max"][data-value="' + value + '"]');
  assert.equal(maxButton(1).getAttribute('aria-pressed'), 'true');
  assert.equal(maxButton(2).getAttribute('aria-pressed'), 'false');
  assert.match(maxButton(1).getAttribute('aria-label'), /Team5/);
  assert.match(row.querySelector('.tier-select').getAttribute('aria-label'), /Team0/);
});

test('team groups are headings, the team box has a name, and entry buttons name their team', async t => {
  const app = await open(t, 14);
  assert.ok(app.$$('.tier-divider').every(d => d.getAttribute('role') === 'heading'));
  assert.ok(app.$('#teamInput').getAttribute('aria-label'));
  assert.equal(app.doc.documentElement.lang, 'en');
  app.place('Team0', 1);
  app.build();
  const unlock = app.card(1, 'Team0').querySelector('.pick-action-btn.unlock');
  assert.match(unlock.getAttribute('aria-label'), /Unlock Team0/);
  assert.match(app.card(1, app.entry(1).find(n => n !== 'Team0' && !app.shared().includes(n))).querySelector('.move').getAttribute('aria-label'), /to Entry 2/);
});

// ---------- Pop-ups: focus ----------

test('opening a pop-up moves focus in, and closing it returns focus to the button', async t => {
  const app = await open(t, 0);
  const helpBtn = app.$('#helpBtn');
  helpBtn.focus();
  helpBtn.click();
  assert.equal(app.doc.activeElement, app.$('#helpCloseBtn'));
  app.$('#helpCloseBtn').click();
  assert.equal(app.doc.activeElement, helpBtn);

  helpBtn.click();
  key(app, app.doc.activeElement, { key: 'Escape' });
  assert.equal(app.doc.activeElement, helpBtn, 'Escape also returns focus');

  const savedBtn = app.$('#historyBtn');
  savedBtn.focus();
  savedBtn.click();
  assert.equal(app.doc.activeElement, app.$('#historyCloseBtn'));
  app.$('#historyCloseBtn').click();
  assert.equal(app.doc.activeElement, savedBtn);
});

test('Tab and Shift+Tab stay inside an open pop-up', async t => {
  const app = await open(t, 0);
  app.$('#helpBtn').click();
  const focusable = [...app.$$('#helpOverlay button, #helpOverlay summary')];
  const first = focusable[0], last = focusable[focusable.length - 1];
  assert.equal(first, app.$('#helpCloseBtn'));

  last.focus();
  key(app, last, { key: 'Tab' });
  assert.equal(app.doc.activeElement, first, 'Tab from the last control wraps to the first');

  key(app, first, { key: 'Tab', shiftKey: true });
  assert.equal(app.doc.activeElement, last, 'Shift+Tab from the first wraps to the last');

  app.$('#helpBtn').focus(); // focus escaped somehow (e.g. clicked behind): Tab pulls it back in
  key(app, app.$('#helpBtn'), { key: 'Tab' });
  assert.ok(app.$('#helpOverlay').contains(app.doc.activeElement));
});

test('loading a setup code closes the Copy / Load pop-up and returns focus', async t => {
  const source = await open(t, 12);
  source.$('#transferBtn').click();
  const code = source.$('#transferOut').value;

  const app = await open(t, 0);
  const opener = app.$('#transferBtn');
  opener.focus();
  opener.click();
  app.$('#transferIn').value = code;
  app.$('#loadSetupBtn').click();
  assert.ok(app.$('#transferOverlay').classList.contains('hidden'));
  assert.equal(app.doc.activeElement, opener);
});

// ---------- Visual accessibility (checked against the real CSS) ----------

function cssVars() {
  const root = STYLE.match(/:root \{([\s\S]*?)\}/)[1];
  return Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const blend = (rgb, alpha) => '#' + rgb.map(c => Math.round(alpha * c + (1 - alpha) * 255).toString(16).padStart(2, '0')).join('');

test('body text colors meet 4.5:1 on every background they sit on', async () => {
  const v = cssVars();
  const amberCard = blend([203, 138, 0], 0.16); // the Shared pick highlight
  const backgrounds = { white: '#ffffff', 'panel-2': v['panel-2'], 'panel-3': v['panel-3'], page: v.bg, 'shared card': amberCard, 'gray chip': '#f3f4f6' };
  for (const [name, bg] of Object.entries(backgrounds)) {
    assert.ok(contrast(v.muted, bg) >= 4.5, `muted text on ${name}: ${contrast(v.muted, bg).toFixed(2)}`);
    assert.ok(contrast(v.text, bg) >= 4.5, `main text on ${name}`);
  }
  assert.ok(contrast('#ffffff', v.green) >= 4.5, `white on green: ${contrast('#ffffff', v.green).toFixed(2)}`);
  assert.ok(contrast(v.green, '#ffffff') >= 4.5, 'green text on white');
  assert.ok(contrast('#ffffff', v.amber) >= 4.5, 'Shared badge');
  assert.ok(contrast('#ffffff', v.red) >= 4.5, 'red grade button');
  assert.ok(contrast('#ffffff', '#6b7280') >= 4.5, 'Push grade button');
});

test('form field borders are visible (3:1 against the page)', async () => {
  const v = cssVars();
  assert.ok(contrast(v['control-line'], '#ffffff') >= 3, 'on white');
  assert.ok(contrast(v['control-line'], v.bg) >= 3, 'on the page background');
  assert.match(STYLE, /textarea \{[^}]*border: 1px solid var\(--control-line\)/);
});

test('keyboard focus is visible and motion can be turned off', async () => {
  assert.match(STYLE, /button:focus-visible[^{]*\{[^}]*outline: 3px solid/);
  assert.match(STYLE, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(STYLE, /select:focus[^{]*\{[^}]*outline: none/, 'focus outline must not be removed');
});
