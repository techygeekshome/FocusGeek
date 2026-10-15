// The page FocusGeek shows instead of a blocked site. The blocked address comes after the # (put there by the
// redirect rule or by FocusGeek when it moves an open tab).
'use strict';
const $ = (id) => document.getElementById(id);
const url = decodeHash(location.hash.slice(1));
let info = null, skew = 0, tick = null;

function decodeHash(h) { if (/^https?%3A/i.test(h)) { try { return decodeURIComponent(h); } catch (e) { } } return h; }

async function load() {
  info = await send({ type: 'info', url });
  skew = info.now - Date.now();
  render();
}
// count this blocked visit straight away (the background only counts it if the site really is blocked right now)
const hit = send({ type: 'hit', url }).then(countLine, () => {});

async function countLine() {
  const i = await send({ type: 'info', url });
  if (!i.cfg.stats || !i.blocked) { $('count').textContent = ''; return; }
  const n = i.todaySite;
  $('count').textContent = n ? `FocusGeek has kept you off ${i.entry} ${n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'} today.` : '';
}

function render() {
  const s = info.status, c = info.cfg, site = info.entry || info.host || 'this site', now = Date.now() + skew;
  document.title = (info.blocked ? 'Blocked: ' : '') + (info.host || 'FocusGeek') + ' | FocusGeek';
  $('site').textContent = info.host || url || 'Unknown page';
  $('wrap').classList.toggle('open', !info.blocked);
  clearInterval(tick);
  if (!info.blocked) {
    $('title').textContent = info.host ? `${info.host} isn’t blocked right now` : 'Nothing to block here';
    $('why').textContent = info.onBreak ? `You allowed it until ${timeText(info.onBreak)}.` : s.when === 'focus' ? 'Your focus session has ended. Nice work.' : 'Blocking is off at the moment.';
    $('timer').hidden = true; $('breakBox').hidden = true;
    $('back').textContent = info.host ? 'Go to ' + info.host : 'Back';
    $('back').onclick = () => { if (info.host) location.replace(url); else history.back(); };
    $('count').textContent = '';
    return;
  }
  $('title').textContent = 'This site is blocked';
  const listWord = c.listMode === 'allow' ? 'It isn’t on your list of allowed sites' : `${site} is on your block list`;
  if (s.focus) $('why').textContent = `${listWord}, and you’re in a focus session until ${timeText(s.focusEnds)}.`;
  else if (s.reason === 'schedule') $('why').textContent = `${listWord}. Your schedule blocks it (${scheduleText(c.schedule)})${s.next ? ', so it opens again at ' + whenText(s.next, now) : ''}.`;
  else $('why').textContent = `${listWord}. It stays blocked until you change that in FocusGeek.`;
  $('timer').hidden = !s.focus;
  if (s.focus) {
    const upd = () => {
      const left = s.focusEnds - (Date.now() + skew);
      $('left').textContent = clockText(left);
      if (left <= 0) { clearInterval(tick); setTimeout(async () => { await send({ type: 'sync' }); load(); }, 400); }
    };
    upd(); tick = setInterval(upd, 1000);
  }
  $('back').textContent = 'Back to work';
  $('back').onclick = backToWork;
  $('breakBox').hidden = !info.canBreak;
  $('breakBtn').textContent = `Allow for ${c.breakMins} minutes`;
  document.querySelector('.mins').textContent = c.breakMins;
  $('typeWant').textContent = site;
}

// Back to the page before, or a fresh new tab if there isn't one (or going back just lands on a blocked site again).
async function backToWork() {
  let tried = 0; try { tried = +sessionStorage.getItem('fgBack') || 0; } catch (e) { }
  if (history.length > 1 && Date.now() - tried > 4000) {
    try { sessionStorage.setItem('fgBack', String(Date.now())); } catch (e) { }
    history.back();
    setTimeout(newTab, 1500);   // nothing to go back to after all
    return;
  }
  newTab();
}
async function newTab() {
  const me = await B.tabs.getCurrent();
  await B.tabs.create({ active: true, index: me ? me.index + 1 : undefined, windowId: me ? me.windowId : undefined });
  if (me) B.tabs.remove(me.id);
}
// came back here straight after "Back to work"? Then the page before was blocked too: open a new tab instead.
try { const t = +sessionStorage.getItem('fgBack') || 0; if (t && Date.now() - t < 4000) { sessionStorage.removeItem('fgBack'); setTimeout(newTab, 300); } } catch (e) { }

// "Allow for 5 minutes": a short wait, then type the site's name.
const WAIT = 10;
$('breakBtn').onclick = () => {
  $('breakBtn').hidden = true; $('breakFlow').hidden = false; $('breakFlow').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  let n = WAIT; $('wait').textContent = n;
  const t = setInterval(() => {
    n--; $('wait').textContent = n;
    if (n <= 0) { clearInterval(t); $('breath').textContent = 'Still need it? Fair enough.'; $('typed').disabled = false; $('typed').focus(); }
  }, 1000);
  $('breakCancel').onclick = () => { clearInterval(t); backToWork(); };
};
const matches = () => normDomain($('typed').value.trim()) === normDomain($('typeWant').textContent);
$('typed').oninput = () => { $('breakGo').disabled = !matches(); };
$('typed').onkeydown = (e) => { if (e.key === 'Enter' && matches()) $('breakGo').click(); };
$('breakGo').onclick = async () => {
  if (!matches()) return;
  $('breakGo').disabled = true;
  const r = await send({ type: 'allow', url });
  if (r && r.ok) location.replace(url);
  else { $('breath').textContent = 'Breaks are switched off right now.'; }
};
$('settings').onclick = (e) => { e.preventDefault(); B.runtime.openOptionsPage(); };

B.storage.onChanged.addListener((ch) => { if (ch.cfg || ch.focus || ch.breaks) { clearTimeout(load.t); load.t = setTimeout(load, 150); } });
setInterval(load, 20000);
load();
