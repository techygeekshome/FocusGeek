// FocusGeek popup. Also works as a normal tab with ?tab=<id> (used by the automated tests and the demo).
'use strict';
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let tab = null, info = null, pickedMins = null, skew = 0, tick = null;

async function getTab() {
  if (q.get('tab')) return B.tabs.get(+q.get('tab')).catch(() => null);
  const [t] = await B.tabs.query({ active: true, currentWindow: true });
  return t || null;
}

// Ask for access to these sites so FocusGeek can show its own page there. Must be called straight from a click.
function askAccess(sites) {
  if (!sites.length) return Promise.resolve(true);
  try { return B.permissions.request({ origins: sites.map(originFor) }).catch(() => false); } catch (e) { return Promise.resolve(false); }
}

async function refresh() {
  info = await send({ type: 'info', url: tab && tab.url || '' });
  skew = info.now - Date.now();
  render();
}

function siteRow(d, noAccess, locked, list) {
  const r = document.createElement('div'); r.className = 'site';
  const s = document.createElement('span'); s.className = 'd'; s.textContent = d; s.title = d + ' and every address under it';
  r.append(s);
  if (noAccess) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'basic'; t.title = 'Blocked with the browser’s own page. Give FocusGeek access to this site in Settings to show the FocusGeek page.'; r.append(t); }
  if (!locked) {
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove ' + d; x.setAttribute('aria-label', 'Remove ' + d);
    x.onclick = async () => { await send({ type: 'removeSites', list, sites: [d] }); refresh(); };
    r.append(x);
  }
  return r;
}

async function render() {
  const c = info.cfg, s = info.status, now = Date.now() + skew;
  const host = tab ? hostOf(tab.url) : '';
  const site = normDomain(host);
  $('host').textContent = host || 'This page';
  // status
  $('status').classList.toggle('on', s.active);
  $('clock').hidden = !s.focus;
  if (s.focus) { $('state').textContent = 'Focus session'; $('sub').textContent = 'Ends at ' + timeText(s.focusEnds); }
  else if (s.active) { $('state').textContent = 'Blocking is on'; $('sub').textContent = s.reason === 'always' ? 'All the time' : scheduleText(c.schedule) + (s.next ? '. Off at ' + whenText(s.next, now) : ''); }
  else {
    $('state').textContent = 'Blocking is off';
    $('sub').textContent = c.when === 'schedule' ? (s.next ? 'Starts at ' + whenText(s.next, now) : 'No days picked in the schedule') : 'Only during a focus session';
  }
  // block / unblock this site
  const allowMode = c.listMode === 'allow';
  const b = $('blockThis'); b.disabled = !site; $('blockNote').hidden = true;
  if (!site) b.textContent = 'This page can’t be blocked';
  else if (!allowMode) {
    const e = matchEntry(host, c.blockList);
    b.textContent = e ? 'Unblock ' + e : 'Block ' + site;
    b.dataset.act = e ? 'remove' : 'add'; b.dataset.site = e || site;
    if (e && s.locked) { b.disabled = true; $('blockNote').hidden = false; $('blockNote').textContent = 'Strict mode: sites can’t be removed until the session ends.'; }
  } else {
    const e = matchEntry(host, c.allowList);
    b.textContent = e ? 'Stop allowing ' + e : 'Allow ' + site;
    b.dataset.act = e ? 'remove' : 'add'; b.dataset.site = e || site;
    if (!e && s.locked) { b.disabled = true; $('blockNote').hidden = false; $('blockNote').textContent = 'Strict mode: no new allowed sites until the session ends.'; }
  }
  // focus
  $('focusPick').hidden = s.focus; $('focusRun').hidden = !s.focus;
  $('endFocus').hidden = s.locked; $('strictNote').hidden = !s.locked;
  if (s.focus) $('focusEnds').textContent = 'Ends at ' + timeText(s.focusEnds) + '. Your list is blocked until then.';
  if (pickedMins === null) pickedMins = c.focusMins;
  for (const x of $('mins').children) x.classList.toggle('on', x.dataset.m === 'custom' ? ![25, 50, 90].includes(pickedMins) : +x.dataset.m === pickedMins);
  $('customRow').hidden = [25, 50, 90].includes(pickedMins);
  if (![25, 50, 90].includes(pickedMins)) $('custom').value = pickedMins;
  // presets (block list mode only)
  $('presets').hidden = allowMode;
  const pr = $('presets'); pr.textContent = '';
  for (const k of PRESET_KEYS) {
    const sites = presetSites(c, k), on = sites.length && sites.every((d) => c.blockList.includes(d));
    const btn = document.createElement('button'); btn.textContent = (on ? '\u2713 ' : '') + PRESETS[k].name; btn.dataset.k = k; btn.className = on ? 'on' : '';
    btn.title = (on ? 'Remove: ' : 'Block: ') + sites.join(', ');
    btn.disabled = on && s.locked;
    btn.onclick = async () => {
      if (on) { await send({ type: 'removeSites', list: 'block', sites }); }
      else { askAccess(sites); await send({ type: 'addSites', list: 'block', sites }); }
      refresh();
    };
    pr.append(btn);
  }
  // list
  const list = allowMode ? c.allowList : c.blockList;
  $('listTitle').textContent = allowMode ? 'Allowed sites' : 'Blocked sites';
  $('listCount').textContent = list.length ? String(list.length) : '';
  $('addSite').placeholder = allowMode ? 'Allow a site, like docs.google.com' : 'Add a site, like youtube.com';
  const box = $('list'); box.textContent = '';
  const noAccess = allowMode ? new Set() : new Set(info.noAccess || []);
  const locked = s.locked && !allowMode;
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = allowMode ? 'No allowed sites yet. Everything else is blocked when blocking is on.' : 'Nothing blocked yet. Add a site or tap a quick add button.'; box.append(e); }
  for (const d of list) box.append(siteRow(d, noAccess.has(d), locked, allowMode ? 'allow' : 'block'));
  $('today').innerHTML = '';
  if (c.stats) { const t = document.createElement('span'); t.append('Blocked today: '); const n = document.createElement('b'); n.textContent = info.todayTotal; t.append(n); $('today').append(t); }
  clearInterval(tick);
  if (s.focus) {
    const upd = () => { const left = s.focusEnds - (Date.now() + skew); $('clock').textContent = clockText(left); if (left <= 0) { clearInterval(tick); setTimeout(async () => { await send({ type: 'sync' }); refresh(); }, 300); } };
    upd(); tick = setInterval(upd, 1000);
  }
}

$('blockThis').onclick = async () => {
  const b = $('blockThis'), d = b.dataset.site, list = info.cfg.listMode === 'allow' ? 'allow' : 'block';
  if (!d) return;
  if (b.dataset.act === 'add') { if (list === 'block') askAccess([d]); await send({ type: 'addSites', list, sites: [d] }); }
  else await send({ type: 'removeSites', list, sites: [d] });
  refresh();
};
$('mins').onclick = (e) => {
  const m = e.target.dataset && e.target.dataset.m; if (!m) return;
  pickedMins = m === 'custom' ? (+$('custom').value || 45) : +m;
  if (m === 'custom') { $('customRow').hidden = false; $('custom').focus(); }
  render();
};
$('custom').oninput = () => { const v = Math.round(+$('custom').value); if (v >= 1 && v <= 600) pickedMins = v; };
$('startFocus').onclick = async () => { await send({ type: 'startFocus', mins: pickedMins }); refresh(); };
$('endFocus').onclick = async () => { await send({ type: 'endFocus' }); refresh(); };
$('addForm').onsubmit = async (e) => {
  e.preventDefault();
  const raw = $('addSite').value, d = normDomain(raw), list = info.cfg.listMode === 'allow' ? 'allow' : 'block';
  $('addNote').hidden = true;
  if (!d) { $('addNote').hidden = false; $('addNote').textContent = 'That doesn’t look like a web address. Try something like youtube.com'; return; }
  if (list === 'block') askAccess([d]);
  const r = await send({ type: 'addSites', list, sites: [d] });
  if (r && r.ok === false) { $('addNote').hidden = false; $('addNote').textContent = 'Strict mode: you can’t change this until the session ends.'; return; }
  $('addSite').value = ''; refresh();
};
$('settings').onclick = (e) => { e.preventDefault(); B.runtime.openOptionsPage(); if (!q.get('tab')) window.close(); };
B.storage.onChanged.addListener(() => { clearTimeout(refresh.t); refresh.t = setTimeout(refresh, 120); });
B.permissions.onAdded.addListener(() => setTimeout(refresh, 200));

(async () => { tab = await getTab(); await refresh(); })();
