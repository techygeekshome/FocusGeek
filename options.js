// FocusGeek settings page.
'use strict';
const $ = (id) => document.getElementById(id);
let info = null;
const ALL = '*://*/*';

function flash() { const s = $('saved'); s.classList.add('show'); clearTimeout(flash.t); flash.t = setTimeout(() => s.classList.remove('show'), 1200); }
async function patch(p) {
  const r = await send({ type: 'setCfg', patch: p });
  if (r && r.ok === false) { note('Strict mode: that can’t change until the focus session ends.'); await load(); return false; }
  flash(); return true;
}
function note(t) { $('formNote').hidden = !t; $('formNote').textContent = t || ''; }
function askAccess(origins) { try { return B.permissions.request({ origins }).catch(() => false); } catch (e) { return Promise.resolve(false); } }

function rows(box, list, which, noAccess, locked) {
  box.textContent = '';
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'None yet.'; box.append(e); }
  for (const d of list) {
    const r = document.createElement('div'); r.className = 'site';
    const s = document.createElement('span'); s.className = 'd'; s.textContent = d; r.append(s);
    if (noAccess && noAccess.has(d)) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'basic'; t.title = 'No access yet: blocked with the browser’s own page'; r.append(t); }
    if (!locked) {
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove ' + d; x.setAttribute('aria-label', 'Remove ' + d);
      x.onclick = async () => { await send({ type: 'removeSites', list: which, sites: [d] }); load(); };
      r.append(x);
    }
    box.append(r);
  }
}

async function load() {
  info = await send({ type: 'info', url: '' });
  const c = info.cfg, s = info.status, locked = s.locked;
  $('lockBox').hidden = !locked; if (locked) $('lockUntil').textContent = timeText(s.focusEnds);
  for (const r of document.querySelectorAll('input[name=listMode]')) { r.checked = r.value === c.listMode; r.disabled = locked; }
  for (const r of document.querySelectorAll('input[name=when]')) { r.checked = r.value === c.when; r.disabled = locked; }
  $('allowNote').hidden = !(c.listMode === 'allow' && !info.allAccess);
  const na = new Set(info.noAccess);
  rows($('blockList'), c.blockList, 'block', na, locked && c.listMode === 'block');
  rows($('allowList'), c.allowList, 'allow', null, false);
  $('blockCount').textContent = c.blockList.length || ''; $('allowCount').textContent = c.allowList.length || '';
  // schedule
  const days = $('days'); days.textContent = '';
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const b = document.createElement('button'); b.textContent = DAY_NAMES[d]; b.className = c.schedule.days.includes(d) ? 'on' : ''; b.dataset.d = d;
    b.onclick = () => { const set = new Set(c.schedule.days); set.has(d) ? set.delete(d) : set.add(d); patch({ schedule: Object.assign({}, c.schedule, { days: [...set].sort() }) }).then(load); };
    days.append(b);
  }
  $('from').value = c.schedule.from; $('to').value = c.schedule.to; $('schedText').textContent = scheduleText(c.schedule);
  $('schedBox').style.opacity = c.when === 'schedule' ? 1 : .55;
  $('focusMins').value = c.focusMins; $('breakMins').value = c.breakMins; $('bm1').textContent = $('bm2').textContent = c.breakMins;
  $('allowBreak').checked = c.allowBreak; $('strict').checked = c.strict; $('stats').checked = c.stats;
  $('allowBreak').disabled = $('strict').disabled = $('breakMins').disabled = locked;
  // presets
  if (!$('presetEdit').children.length) {
    for (const k of PRESET_KEYS) {
      const w = document.createElement('div');
      const l = document.createElement('div'); l.className = 'lab'; l.textContent = PRESETS[k].name;
      const reset = document.createElement('button'); reset.className = 'small ghost'; reset.textContent = 'Reset';
      l.append(reset);
      const t = document.createElement('textarea'); t.id = 'preset-' + k; t.spellcheck = false;
      t.onchange = () => {
        const sites = [...new Set(t.value.split(/[\s,]+/).map(normDomain).filter(Boolean))];
        const presets = Object.assign({}, info.cfg.presets || {}, { [k]: sites });
        patch({ presets }).then(load);
      };
      reset.onclick = () => { const presets = Object.assign({}, info.cfg.presets || {}); delete presets[k]; patch({ presets }).then(load); };
      w.append(l, t); $('presetEdit').append(w);
    }
  }
  for (const k of PRESET_KEYS) { const t = $('preset-' + k); if (document.activeElement !== t) t.value = presetSites(c, k).join('\n'); }
  // access
  const missing = c.listMode === 'block' ? info.noAccess : [];
  $('accessList').textContent = info.allAccess ? 'FocusGeek has access to all sites.' : missing.length ? 'Blocked without access (browser page): ' + missing.join(', ') : 'Every site on your block list has access.';
  $('fixAccess').hidden = !missing.length || info.allAccess;
  $('allAccess').hidden = info.allAccess;
  // stats
  const all = (await B.storage.local.get('stats')).stats || {};
  const now = info.now, today = all[dayKey(now)] || {}, week = {};
  for (let i = 0; i < 7; i++) for (const [d, n] of Object.entries(all[dayKey(now - i * 86400000)] || {})) week[d] = (week[d] || 0) + n;
  const tb = $('statsTable').tBodies[0]; tb.textContent = '';
  const top = Object.entries(week).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!top.length) { const tr = tb.insertRow(); const td = tr.insertCell(); td.colSpan = 3; td.className = 'muted'; td.textContent = c.stats ? 'Nothing blocked in the last 7 days.' : 'Counting is off.'; }
  for (const [d, n] of top) { const tr = tb.insertRow(); tr.insertCell().textContent = d; const a = tr.insertCell(); a.className = 'n'; a.textContent = today[d] || 0; const b = tr.insertCell(); b.className = 'n'; b.textContent = n; }
}

for (const r of document.querySelectorAll('input[name=listMode]')) r.onchange = () => {
  if (r.value === 'allow' && !info.allAccess) askAccess([ALL]);
  patch({ listMode: r.value }).then(load);
};
for (const r of document.querySelectorAll('input[name=when]')) r.onchange = () => patch({ when: r.value }).then(load);
$('from').onchange = $('to').onchange = () => { if ($('from').value && $('to').value) patch({ schedule: Object.assign({}, info.cfg.schedule, { from: $('from').value, to: $('to').value }) }).then(load); };
$('focusMins').onchange = () => { const v = Math.round(+$('focusMins').value); if (v >= 1 && v <= 600) patch({ focusMins: v }); };
$('breakMins').onchange = () => { const v = Math.round(+$('breakMins').value); if (v >= 1 && v <= 60) patch({ breakMins: v }).then(load); };
$('allowBreak').onchange = () => patch({ allowBreak: $('allowBreak').checked });
$('strict').onchange = () => patch({ strict: $('strict').checked });
$('stats').onchange = () => patch({ stats: $('stats').checked }).then(load);
$('clearStats').onclick = async () => { await send({ type: 'clearStats' }); load(); };
$('allowAllBtn').onclick = $('allAccess').onclick = () => { askAccess([ALL]).then(() => setTimeout(load, 200)); };
$('fixAccess').onclick = () => { askAccess(info.noAccess.map(originFor)).then(() => setTimeout(load, 200)); };
function addForm(form, input, which) {
  form.onsubmit = async (e) => {
    e.preventDefault(); note('');
    const sites = input.value.split(/[\s,]+/).map(normDomain).filter(Boolean);
    if (!sites.length) { note('That doesn’t look like a web address. Try something like youtube.com'); return; }
    if (which === 'block') askAccess(sites.map(originFor));
    const r = await send({ type: 'addSites', list: which, sites });
    if (r && r.ok === false) { note('Strict mode: that can’t change until the focus session ends.'); return; }
    input.value = ''; flash(); load();
  };
}
addForm($('blockForm'), $('blockAdd'), 'block');
addForm($('allowForm'), $('allowAdd'), 'allow');
B.storage.onChanged.addListener(() => { clearTimeout(load.t); load.t = setTimeout(load, 150); });
B.permissions.onAdded.addListener(() => setTimeout(load, 200));
B.permissions.onRemoved.addListener(() => setTimeout(load, 200));
load();
