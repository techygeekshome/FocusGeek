# FocusGeek: Block Websites

Block the websites that eat your day. Block them all the time, on a schedule (like weekdays 9 to 5), or only while a focus timer runs. Blocked sites show a calm page with the time left, instead of the feed you were about to scroll. Everything stays on your computer.

**Download and full guide:** https://techygeekshome.info/browser-extensions/focusgeek/

## What it does

- **Block this site** in one click from the toolbar button. Blocking a site also blocks everything under it, so `youtube.com` covers `m.youtube.com` and `music.youtube.com`.
- **Quick add** buttons for Social media, News, Video and Shopping. Tap one to block the whole group, tap it again to remove it. You can edit what is in each group in the settings.
- **Three ways to block**: all the time, on a schedule (pick the days and times, overnight works too), or only during a focus session.
- **Focus timer**: 25, 50 or 90 minutes, or your own length. Your list is blocked until the time is up, whatever else is set, and the toolbar shows the minutes left.
- **A calm blocked page** that says what is blocked and why, counts down the focus time and has a big **Back to work** button.
- **Allow for 5 minutes** when you really need a site: a 10 second pause, then type the site's name. You can switch this off, or turn on **strict mode**, which hides it (and "End session") during a focus session.
- **Allow list mode**: block everything except the sites you list.
- **Tabs already open** on a site you block are moved to the blocked page straight away.
- **Block count** (optional): how often each site was blocked today and this week, kept on your computer only.

## What it won't do

- It does not block parts of a site (like one page or one channel). It blocks whole domains.
- It can't stop you uninstalling or switching it off. It is there to help, not to lock you out.
- It is off in private windows until you allow it there (see below).
- It has no account, no sync between computers and no adverts.

## Install

Pick the download for your browser from the [latest release](https://github.com/techygeekshome/FocusGeek/releases/latest).

| Browser | Download |
|---|---|
| Chrome, Brave, Opera, Vivaldi | `FocusGeek-chrome.zip` |
| Microsoft Edge | `FocusGeek-edge.zip` |
| Firefox (142 or newer) | `FocusGeek-firefox.zip` |

`FocusGeek.zip` is the same package as the Chrome and Edge downloads.

### Chrome, Edge, Brave, Opera and Vivaldi

1. Unzip the download somewhere you'll keep it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `focusgeek` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `FocusGeek-firefox.zip`.

Firefox removes temporary add-ons when it closes.

### Build it yourself

The code in this repo is the Chromium version. `manifest.firefox.json` is the Firefox manifest. Run `./build.sh` to make every package in `dist/`.

## Use

1. Go to a site that distracts you and click the FocusGeek button.
2. Click **Block** and the site name. Your browser asks once whether FocusGeek may use that site, so it can show its own blocked page there.
3. Or tap a quick add button, or type a site into the box.
4. Pick when to block in **Settings**, or start a focus timer from the button.

### Private windows

Browsers keep extensions switched off in private windows unless you allow them. To block sites there too, open FocusGeek's details on the extensions page and turn on **Allow in Incognito** (Chrome, Brave), **Allow in InPrivate** (Edge) or **Run in Private Windows** (Firefox).

## How it works

- Blocking uses the browser's built-in **declarativeNetRequest** rules (`background.js`). FocusGeek gives the browser a short list of rules; the browser itself checks each page you open against them, so FocusGeek never reads or watches your browsing.
- A blocked site is sent to `blocked.html` with a redirect rule. Browsers only let an extension redirect a site it has been given access to, so FocusGeek asks for access **one site at a time**, when you add that site. If you say no, the site is still blocked with a plain "block" rule, and the browser shows its own "blocked" page instead of FocusGeek's.
- Allow list mode can only show FocusGeek's page if you give it access to all sites (it asks when you switch the mode on). Without it, it still blocks, with the browser's page.
- Schedules, focus sessions and 5 minute breaks are kept in `chrome.storage.local`, and `alarms` wake FocusGeek at the next change (a schedule edge, the end of a session or a break) to swap the rules.
- When blocking starts, open tabs on blocked sites that FocusGeek can see (sites it has access to, or the tab you clicked the button on) are moved to the blocked page.
- No remote code, no libraries, no network requests.

## Permissions

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Blocks the sites on your list, using rules the browser checks itself |
| `storage` | Keeps your lists, schedule, settings and the optional block count |
| `alarms` | Starts and stops blocking at schedule times and at the end of a focus session or break |
| `activeTab` | Lets the button see the site you are on, only when you click it |
| Optional site access | Asked for one site at a time when you block it, so FocusGeek can show its own blocked page there. Never asked at install |

## Privacy

FocusGeek has no account, no analytics and makes no network requests of its own. Your lists, schedule and block counts stay in your browser and are never sent anywhere.

## Licence

GPL-3.0. Free for everyone, including commercial use.

FocusGeek is an independent tool made by [TechyGeeksHome](https://techygeekshome.info).
