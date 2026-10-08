# Study Stock — code walkthrough

This guide explains the current version of the project. Line numbers can shift as you edit the code, so use the named functions and comments as your landmarks.

## 1. `package.json` — how the app starts

- The `main` field points Electron at `main.js`, the desktop-process entry point.
- The `start` script runs `electron .`, so `npm start` launches the widget.
- Electron provides the desktop window and IPC bridge. `uiohook-napi` observes global mouse/keyboard activity so the app can estimate idle time.

## 2. `main.js` — desktop window and tracking engine

### Configuration

- `START_HOUR` and `END_HOUR` define the local tracking window: 6:00 AM inclusive through 9:00 PM exclusive.
- `IDLE_SECONDS` is the 60-second activity grace period.
- `COST_PER_HOUR` is the symbolic rate: $30 per hour. It is used both for stock gains while studying and stock losses while idle.
- `OPENING_STOCK_VALUE` sets the daily opening value to $100.

### Saved data and time tracking

- `loadHistory()` reads the JSON file in Electron's per-user app-data folder. `saveHistory()` writes daily totals to that file.
- `todayRecord()` creates or returns today's record. Productive and idle seconds are saved by date.
- `inTrackingWindow()` checks the computer's local time.
- `currentlyStudying()` returns true when the manual study override is on or recent mouse/keyboard activity occurred within the last 60 seconds.
- `updateCounters()` accounts for elapsed time in small chunks, but only inside the tracking window and when tracking isn't paused or the computer asleep. Each chunk becomes either productive seconds or idle seconds.
- `stockValue()` computes the live symbolic value from today's totals: `$100 + productive-time gains − idle-time losses`, with a floor of `$0`.
- `idleCost()` still calculates the cumulative symbolic cost of idle time, though the main ticker now displays the remaining stock value instead.

### Window, tray, and IPC

- `createWindow()` makes a frameless, resizable, always-on-top Electron window. It enables `contextIsolation` and disables `nodeIntegration`.
- Closing the note hides it so tracking can continue in the background.
- `createTray()` adds a system-tray menu for showing the widget, toggling study override, pausing, or quitting.
- `sendState()` and the `state:get` handler send the current stock value, rate, productive totals, lifetime total, and daily history to the renderer.
- The global `Ctrl+Shift+S` shortcut toggles a 30-minute manual study override.
- The one-second interval updates counters and refreshes the widget. Sleep/wake handlers avoid counting time while the computer is asleep.

## 3. `preload.js` — the safe bridge

The preload script exposes a small `window.studyStock` API for requesting state, toggling study mode, pausing, hiding the widget, and listening for updates. It does not give the page direct filesystem access or unrestricted IPC access.

## 4. `index.html` — the widget structure

- The top bar contains the title and hide button.
- The ticker shows today's stock value and the per-minute gain/loss rate.
- The stats show today's productive minutes and lifetime productive minutes.
- The SVG chart displays a rolling 60-second view of the stock value.
- The footer contains the study-override and pause buttons.

## 5. `style.css` — appearance

The CSS styles the sticky-note background, typography, spacing, controls, and chart. The chart's three line classes carry the color meanings:

- `.study-line` is green while studying.
- `.idle-line` is red while idle and losing value.
- `.closed-line` is gray while paused or outside tracking hours.

## 6. `renderer.js` — live numbers and chart

- It finds the HTML elements and formats productive time as whole minutes.
- `modeFor()` classifies each sample as studying, idle, or closed/paused.
- `render()` updates the stock value, per-minute rate, status, and button labels from the main-process state.
- The renderer keeps up to 60 recent samples in memory. `drawChart()` maps those values into the SVG and draws green, red, and gray segments according to the mode of each sample.
- The live chart is intentionally a short-term view; it resets when the app restarts. Daily totals remain saved locally.

## 7. `tray.png`

This small PNG is the system-tray icon used by Electron.

## Tracking model in plain English

1. A global mouse or keyboard event updates the last-activity timestamp. The app does not store typed text or mouse coordinates.
2. Once per second, the main process accounts for elapsed time during the 6 AM–9 PM tracking window.
3. Recent activity or the manual override counts as studying. Studying adds symbolic value at $30/hour; idle time subtracts value at $30/hour.
4. The stock value opens at $100 each day and is not allowed to fall below $0.
5. The renderer shows a green line for studying, a red line for idle loss, and gray for paused/closed time.
6. Daily productive and idle totals are saved in local JSON history. The short rolling chart itself is held in memory and resets when the app restarts.

## First run

1. Install Node.js LTS.
2. Extract the ZIP.
3. Open PowerShell in the extracted folder.
4. Run `npm install`.
5. Run `npm start`.

## Prototype caveats

- `uiohook-napi` is a native dependency and may need a compatible binary or rebuild for your Electron version.
- Computer activity is only a proxy for studying. Use the manual override for reading, lectures, or paper-based work.
- This is a starter prototype. Test sleep/wake, midnight, and daylight-saving transitions before relying on precise totals.
- Windows startup is described in `README.md` but is not enabled by default.
