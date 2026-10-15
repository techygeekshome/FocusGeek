// FocusGeek background: turns the block list, the schedule and focus sessions into declarativeNetRequest rules.
// Blocked pages are sent to blocked.html (needs access to that site). Sites FocusGeek has no access to are still blocked,
// with the browser's own "blocked" page. Nothing is sent anywhere: all settings and counts stay in storage.local.
'use strict';
if (typeof normDomain === 'undefined' && typeof importScripts === 'function') importScripts('common.js');

// clock.off is only ever changed by the automated tests (to check schedule edges without waiting for 9am).
var clock = { off: 0, now() { return Date.now() + this.off; } };
var BLOCKED = B.runtime.getURL('blocked.html');
var R_REDIRECT = 1, R_BLOCK = 2, R_ALLOW = 3;
var ALL = '*://*/*';

async function load() {
  const s = await B.storage.local.get(['cfg', 'focus', 'breaks']);
  return { cfg: withDefaults(s.cfg), focus: s.focus || null, breaks: s.breaks || {} };
}

function focusOn(st, now) { return !!(st.focus && st.focus.endsAt > now); }

// What is going on right now: is blocking on, why, and when does that next change?
function status(st, now) {
  const c = st.cfg, f = focusOn(st, now);
  const sch = c.when === 'schedule' ? inSchedule(c.schedule, now) : false;
  const nb = c.when === 'schedule' ? nextBoundary(c.schedule, now) : 0;
  const s = { active: false, reason: 'off', focus: f, focusEnds: f ? st.focus.endsAt : 0, next: nb, when: c.when, listMode: c.listMode };
  if (f) { s.active = true; s.reason = 'focus'; }
  else if (c.when === 'always') { s.active = true; s.reason = 'always'; }
  else if (sch) { s.active = true; s.reason = 'schedule'; }
  s.locked = f && c.strict;
  return s;
}

function liveBreaks(st, now) {
  const b = {};
  for (const [d, t] of Object.entries(st.breaks || {})) if (t > now) b[d] = t;
  return b;
}

// Is this host blocked at the moment (ignoring breaks)? Returns the list entry it falls under, or the host itself in allow list mode.
function blockedEntry(st, host) {
  if (!host) return '';
  const c = st.cfg;
  if (c.listMode === 'allow') return matchEntry(host, c.allowList) ? '' : (normDomain(host) || host);
  return matchEntry(host, c.blockList);
}

async function permitted(list) {
  if (await B.permissions.contains({ origins: [ALL] }).catch(() => false)) return new Set(list);
  const out = new Set();
  await Promise.all(list.map(async (d) => { if (await B.permissions.contains({ origins: [originFor(d)] }).catch(() => false)) out.add(d); }));
  return out;
}

async function buildRules(st, s, now) {
  const rules = [];
  if (!s.active) return rules;
  const c = st.cfg;
  const redirect = { type: 'redirect', redirect: { regexSubstitution: BLOCKED + '#\\0' } };
  if (c.listMode === 'block') {
    const list = [...new Set(c.blockList)];
    const ok = await permitted(list);
    const red = list.filter((d) => ok.has(d)), blk = list.filter((d) => !ok.has(d));
    if (red.length) rules.push({ id: R_REDIRECT, priority: 2, action: redirect, condition: { regexFilter: '^https?://.*', requestDomains: red, resourceTypes: ['main_frame'] } });
    if (blk.length) rules.push({ id: R_BLOCK, priority: 2, action: { type: 'block' }, condition: { requestDomains: blk, resourceTypes: ['main_frame'] } });
  } else {
    const all = await B.permissions.contains({ origins: [ALL] }).catch(() => false);
    const cond = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] };
    if (c.allowList.length) cond.excludedRequestDomains = [...new Set(c.allowList)];
    rules.push(all ? { id: R_REDIRECT, priority: 2, action: redirect, condition: cond } : { id: R_BLOCK, priority: 2, action: { type: 'block' }, condition: cond });
  }
  const br = Object.keys(liveBreaks(st, now));
  if (br.length) rules.push({ id: R_ALLOW, priority: 3, action: { type: 'allow' }, condition: { requestDomains: br, resourceTypes: ['main_frame'] } });
  return rules;
}

const norm = (rs) => JSON.stringify(rs.map((r) => ({ id: r.id, priority: r.priority, action: r.action, condition: r.condition })).sort((a, b) => a.id - b.id));

// Send open tabs on a site that is now blocked to the blocked page. Only tabs whose address FocusGeek can see
// (sites it has access to, or the tab you clicked the button on) are moved.
async function sweep(st, s, now) {
  if (!s.active) return 0;
  const br = liveBreaks(st, now);
  let n = 0;
  for (const t of await B.tabs.query({})) {
    const h = hostOf(t.url);
    if (!h) continue;
    const e = blockedEntry(st, h);
    if (!e || matchEntry(h, Object.keys(br))) continue;
    try { await B.tabs.update(t.id, { url: BLOCKED + '#' + t.url }); n++; } catch (e2) { }
  }
  return n;
}

var timer = null;
async function doSync() {
  const now = clock.now();
  const st = await load();
  // tidy up a finished focus session and ended breaks
  if (st.focus && st.focus.endsAt <= now) { st.focus = null; await B.storage.local.remove('focus'); }
  const lb = liveBreaks(st, now);
  if (Object.keys(lb).length !== Object.keys(st.breaks).length) { st.breaks = lb; await B.storage.local.set({ breaks: lb }); }
  const s = status(st, now);
  const rules = await buildRules(st, s, now);
  const old = await B.declarativeNetRequest.getDynamicRules();
  if (norm(old) !== norm(rules)) {
    await B.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules: rules });
  }
  // the next moment something changes: focus end, schedule edge or a break running out
  const times = [s.focusEnds, st.cfg.when === 'schedule' ? s.next : 0, ...Object.values(lb)].filter((t) => t > now);
  const next = times.length ? Math.min(...times) : 0;
  if (next) await B.alarms.create('change', { when: Math.max(Date.now() + 500, next - clock.off) });
  else await B.alarms.clear('change');
  if (!(await B.alarms.get('tick'))) await B.alarms.create('tick', { periodInMinutes: 1 });
  clearTimeout(timer);
  if (next && next - now < 10 * 60000) timer = setTimeout(() => sync('timer'), next - now + 50);
  // toolbar: minutes left in a focus session
  const left = s.focus ? Math.max(1, Math.ceil((s.focusEnds - now) / 60000)) : 0;
  await B.action.setBadgeText({ text: left ? left + 'm' : '' });
  await B.action.setBadgeBackgroundColor({ color: '#0e7490' });
  if (B.action.setBadgeTextColor) await B.action.setBadgeTextColor({ color: '#ffffff' }).catch(() => {});
  await B.action.setTitle({ title: 'FocusGeek: ' + (s.focus ? `focus session, ${left} min left` : s.active ? 'blocking is on' : 'blocking is off') });
  const moved = await sweep(st, s, now);
  return { status: s, rules, moved };
}
var chain = Promise.resolve();
function sync(why) {
  const p = chain.then(() => doSync(why));
  chain = p.catch((e) => console.error('FocusGeek sync', e));
  return p;
}

async function save(obj) { await B.storage.local.set(obj); return sync('save'); }

function mergeList(list, add) { return [...new Set([...list, ...add.map(normDomain).filter(Boolean)])].sort(); }

// During a strict focus session, nothing that weakens blocking may change.
function weakens(st, patch) {
  const c = st.cfg;
  for (const k of Object.keys(patch)) {
    if (k === 'blockList') { if (c.listMode === 'block' && c.blockList.some((d) => !patch.blockList.includes(d))) return true; }
    else if (k === 'allowList') { if (c.listMode === 'allow' && patch.allowList.some((d) => !c.allowList.includes(d))) return true; }
    else if (['listMode', 'when', 'strict', 'allowBreak', 'breakMins'].includes(k)) { if (JSON.stringify(patch[k]) !== JSON.stringify(c[k])) return true; }
  }
  return false;
}

async function info(url) {
  const now = clock.now(), st = await load(), s = status(st, now);
  const host = hostOf(url), entry = blockedEntry(st, host);
  const br = liveBreaks(st, now);
  const onBreak = host && matchEntry(host, Object.keys(br));
  const stats = (await B.storage.local.get('stats')).stats || {};
  const today = stats[dayKey(now)] || {};
  const ok = await permitted(st.cfg.blockList);
  return {
    noAccess: st.cfg.blockList.filter((d) => !ok.has(d)),
    allAccess: await B.permissions.contains({ origins: [ALL] }).catch(() => false),
    now, host, entry, status: s, blocked: !!(s.active && entry && !onBreak), onBreak: onBreak ? br[onBreak] : 0,
    cfg: st.cfg, focus: st.focus, breaks: br,
    canBreak: st.cfg.allowBreak && !s.locked,
    todayTotal: Object.values(today).reduce((a, b) => a + b, 0), todaySite: entry ? (today[entry] || 0) : 0,
  };
}

async function handle(m, sender) {
  const now = clock.now();
  const st = await load(), s = status(st, now);
  switch (m.type) {
    case 'info': return info(m.url || '');
    case 'sync': return (await sync('page')).status;
    case 'addSites': {
      const key = m.list === 'allow' ? 'allowList' : 'blockList';
      const next = mergeList(st.cfg[key], m.sites || []);
      if (s.locked && weakens(st, { [key]: next })) return { ok: false, error: 'locked' };
      st.cfg[key] = next; await save({ cfg: st.cfg });
      return { ok: true, list: next };
    }
    case 'removeSites': {
      const key = m.list === 'allow' ? 'allowList' : 'blockList';
      const drop = new Set((m.sites || []).map(normDomain));
      const next = st.cfg[key].filter((d) => !drop.has(d));
      if (s.locked && weakens(st, { [key]: next })) return { ok: false, error: 'locked' };
      st.cfg[key] = next; await save({ cfg: st.cfg });
      return { ok: true, list: next };
    }
    case 'setCfg': {
      const patch = m.patch || {};
      if (patch.blockList) patch.blockList = mergeList([], patch.blockList);
      if (patch.allowList) patch.allowList = mergeList([], patch.allowList);
      if (s.locked && weakens(st, patch)) return { ok: false, error: 'locked' };
      const cfg = withDefaults(Object.assign({}, st.cfg, patch));
      await save({ cfg });
      return { ok: true, cfg };
    }
    case 'startFocus': {
      const mins = Math.max(1, Math.min(600, Math.round(+m.mins || st.cfg.focusMins)));
      const focus = { startedAt: now, endsAt: now + mins * 60000, mins };
      await B.storage.local.set({ focus });
      const r = await sync('focus');
      return { ok: true, focus, status: r.status };
    }
    case 'endFocus': {
      if (s.locked) return { ok: false, error: 'locked' };
      await B.storage.local.remove('focus');
      const r = await sync('focus');
      return { ok: true, status: r.status };
    }
    case 'allow': {
      if (!st.cfg.allowBreak || s.locked) return { ok: false, error: 'locked' };
      const host = hostOf(m.url || '');
      const d = (st.cfg.listMode === 'block' ? matchEntry(host, st.cfg.blockList) : '') || normDomain(host);
      if (!d) return { ok: false, error: 'bad url' };
      const until = now + st.cfg.breakMins * 60000;
      const breaks = Object.assign(liveBreaks(st, now), { [d]: until });
      await B.storage.local.set({ breaks });
      await sync('allow');
      return { ok: true, domain: d, until };
    }
    case 'hit': {
      // one at a time, so two blocked pages loading together can't overwrite each other's count
      const p = hitChain.then(() => countHit(m.url || '', now));
      hitChain = p.catch(() => {});
      return p;
    }
    case 'clearStats': await B.storage.local.remove('stats'); return { ok: true };
  }
  return null;
}

var hitChain = Promise.resolve();
async function countHit(url, now) {
  const st = await load();
  const i = await info(url);
  if (!st.cfg.stats || !i.blocked) return { ok: false };
  const d = i.entry;
  const all = (await B.storage.local.get('stats')).stats || {};
  const k = dayKey(now); const day = all[k] = all[k] || {}; day[d] = (day[d] || 0) + 1;
  for (const key of Object.keys(all).sort().slice(0, -30)) delete all[key];   // keep 30 days
  await B.storage.local.set({ stats: all });
  return { ok: true, count: day[d] };
}

B.runtime.onMessage.addListener((m, sender, reply) => {
  handle(m, sender).then(reply, (e) => reply({ ok: false, error: String(e) }));
  return true;
});
B.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.cfg || ch.focus || ch.breaks)) sync('storage'); });
B.permissions.onAdded.addListener(() => sync('perm'));
B.permissions.onRemoved.addListener(() => sync('perm'));
B.alarms.onAlarm.addListener(() => sync('alarm'));
B.runtime.onStartup.addListener(() => sync('startup'));
B.runtime.onInstalled.addListener(() => sync('installed'));
sync('wake');
