// FocusGeek shared helpers: used by the background, the popup, the settings page and the blocked page.
// Nothing here talks to the network.
'use strict';
var B = globalThis.browser || globalThis.chrome;

var PRESETS = {
  social: { name: 'Social media', sites: ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'reddit.com', 'snapchat.com', 'threads.net', 'bsky.app', 'pinterest.com'] },
  news: { name: 'News', sites: ['bbc.co.uk', 'bbc.com', 'theguardian.com', 'dailymail.co.uk', 'independent.co.uk', 'news.sky.com', 'cnn.com', 'foxnews.com', 'nytimes.com', 'news.google.com'] },
  video: { name: 'Video', sites: ['youtube.com', 'netflix.com', 'twitch.tv', 'primevideo.com', 'disneyplus.com', 'vimeo.com', 'dailymotion.com'] },
  shopping: { name: 'Shopping', sites: ['amazon.co.uk', 'amazon.com', 'ebay.co.uk', 'ebay.com', 'etsy.com', 'temu.com', 'shein.com', 'aliexpress.com', 'argos.co.uk', 'vinted.co.uk'] },
};
var PRESET_KEYS = ['social', 'news', 'video', 'shopping'];

var DEFAULTS = {
  listMode: 'block',          // 'block': block the sites on the list. 'allow': block everything except the allowed sites.
  blockList: [],
  allowList: [],
  when: 'always',             // 'always', 'schedule' or 'focus' (only during a focus session)
  schedule: { days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00' },
  focusMins: 25,
  strict: false,              // during a focus session: no "Allow for 5 minutes", no ending early, no removing sites
  allowBreak: true,           // show "Allow for 5 minutes" on the blocked page
  breakMins: 5,
  stats: true,                // keep a count of blocked visits, on this computer only
  presets: null,              // the user's edited presets: { social: [...], ... } (null = the defaults)
};

function withDefaults(cfg) {
  const c = Object.assign({}, DEFAULTS, cfg || {});
  c.schedule = Object.assign({}, DEFAULTS.schedule, (cfg && cfg.schedule) || {});
  c.blockList = Array.isArray(c.blockList) ? c.blockList : [];
  c.allowList = Array.isArray(c.allowList) ? c.allowList : [];
  return c;
}

function presetSites(cfg, key) {
  const p = cfg && cfg.presets && Array.isArray(cfg.presets[key]) ? cfg.presets[key] : PRESETS[key].sites;
  return p.map(normDomain).filter(Boolean);
}

// Turns what someone typed or a page address into a plain domain: "https://www.YouTube.com/watch?v=1" -> "youtube.com".
// A leading "www." is dropped, because blocking a domain also blocks every subdomain under it.
function normDomain(s) {
  if (!s) return '';
  s = String(s).trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s.replace(/^\/+/, '');
  let h;
  try { const u = new URL(s); if (!/^https?:$/.test(u.protocol)) return ''; h = u.hostname; } catch (e) { return ''; }
  h = h.replace(/\.+$/, '').replace(/^\.+/, '');
  if (h.startsWith('[')) return '';                 // IPv6 literals are left out
  if (h.startsWith('www.') && h.split('.').length > 2) h = h.slice(4);
  if (!h || !/^[a-z0-9.-]+$/.test(h) || h.includes('..')) return '';
  if (!h.includes('.') && h !== 'localhost') return '';
  return h;
}

function isIp(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }
// Match pattern for a domain and every subdomain under it.
function originFor(d) { return (isIp(d) || d === 'localhost') ? `*://${d}/*` : `*://*.${d}/*`; }

// The list entry a host falls under (the longest one), or '' if none: "m.youtube.com" is under "youtube.com".
function matchEntry(host, list) {
  host = (host || '').toLowerCase().replace(/\.$/, '');
  let best = '';
  for (const d of list || []) if ((host === d || host.endsWith('.' + d)) && d.length > best.length) best = d;
  return best;
}

function hostOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : ''; } catch (e) { return ''; } }

// ---- schedule ----
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function hm(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 0; }

// Is time t (ms) inside the schedule? "to" earlier than "from" runs past midnight (it belongs to the day it starts).
// "from" equal to "to" means all day on the ticked days.
function inSchedule(sch, t) {
  const d = new Date(t), m = d.getHours() * 60 + d.getMinutes(), day = d.getDay(), prev = (day + 6) % 7;
  const f = hm(sch.from), to = hm(sch.to), days = sch.days || [];
  if (f === to) return days.includes(day);
  if (f < to) return days.includes(day) && m >= f && m < to;
  return (days.includes(day) && m >= f) || (days.includes(prev) && m < to);
}

// The next moment after t when the schedule turns on or off, or 0 if it never changes.
function nextBoundary(sch, t) {
  const now = inSchedule(sch, t), base = new Date(t);
  const cands = [];
  for (let i = 0; i <= 8; i++) {
    for (const s of [sch.from, sch.to]) {
      const m = hm(s);
      const c = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, Math.floor(m / 60), m % 60, 0, 0).getTime();
      if (c > t) cands.push(c);
    }
  }
  cands.sort((a, b) => a - b);
  for (const c of cands) if (inSchedule(sch, c) !== now) return c;
  return 0;
}

function scheduleText(sch) {
  const days = (sch.days || []).slice().sort((a, b) => a - b);
  let d;
  if (days.length === 7) d = 'Every day';
  else if (days.join() === '1,2,3,4,5') d = 'Weekdays';
  else if (days.join() === '0,6') d = 'Weekends';
  else if (!days.length) d = 'No days picked';
  else d = days.map((x) => DAY_NAMES[x]).join(', ');
  return sch.from === sch.to ? `${d}, all day` : `${d}, ${sch.from} to ${sch.to}`;
}

// ---- formatting ----
function clockText(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
function timeText(t) { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function whenText(t, now) {
  const a = new Date(t), b = new Date(now);
  const sameDay = a.toDateString() === b.toDateString();
  const tomorrow = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).toDateString() === a.toDateString();
  return timeText(t) + (sameDay ? ' today' : tomorrow ? ' tomorrow' : ' on ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.getDay()]);
}
function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function send(msg) { return B.runtime.sendMessage(msg); }
