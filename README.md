# Study Stock Widget (Windows / Electron)

A tiny sticky-note desktop widget. It estimates study time from system-wide input activity, shows a live symbolic stock value, and stores daily totals locally.

## Requirements

- Windows 10 or 11
- Node.js LTS (install from https://nodejs.org)
- An internet connection for the first dependency install

## Run it

1. Extract this folder somewhere convenient.
2. Open PowerShell in this folder.
3. Run `npm install`.
4. Create the tray icon as described below.
5. Run `npm start`.

## Create the tray icon

Electron expects `tray.png` beside `main.js`. You can use any small PNG icon, ideally 16x16 or 32x32 pixels, and name it `tray.png`. If you omit this file, the app may fail when creating the tray.

## What the code does

- `main.js`: owns the window, tray, hotkey, input activity, tracking logic, and JSON persistence.
- `preload.js`: exposes a small, explicit API to the web page using Electron IPC.
- `index.html`: the note's content and controls.
- `style.css`: sticky-note visuals and drag behavior.
- `renderer.js`: formats counters and draws a live 60-second stock chart (green while studying, red while idle, gray when paused/closed).
- `history.json`: created automatically under Electron's per-user app-data folder after launch.

## Controls

- `Ctrl + Shift + S`: toggle a 30-minute manual study override.
- Click **I'm studying** to toggle the same override.
- Click **Pause** to stop counting both productive and idle time.
- Close/hide button hides the widget; choose **Quit** from the tray to exit.

## Tracking rules

- The allowed tracking window is 6:00 AM inclusive to 9:00 PM exclusive, using the computer's local time.
- Mouse movement, mouse clicks, and keyboard activity update the last-input timestamp. The app does not save typed text or mouse coordinates.
- Activity within the last 60 seconds is treated as "probably studying"; no input for longer than 60 seconds is treated as idle.
- The symbolic stock opens at $100 each day. Studying adds $30 per hour and idle time subtracts $30 per hour. Change `OPENING_STOCK_VALUE` and `COST_PER_HOUR` in `main.js` to adjust these values.
- The displayed stock value never falls below $0. Daily productive minutes and idle minutes are stored locally.

## Windows startup (optional)

Once the app runs reliably, add this in `app.whenReady()` after `createWindow()` to launch it when you sign in:

```js
app.setLoginItemSettings({ openAtLogin: true });
```

To disable it, set `openAtLogin: false`.

## Important prototype limitations

- This is a starter prototype, not a fully hardened release.
- The global input hook uses a native Node module and may need a compatible Node/Electron build on some systems. If `uiohook-napi` fails to load, the app logs a warning and the manual hotkey remains available.
- The tray requires a valid `tray.png` image file.
- A manual override expires after 30 minutes by design.
- The chart is a compact live view of the last 60 seconds, not a full finance-style chart. Daily totals are still stored locally.
- The current implementation should be tested around sleep/wake, daylight-saving changes, and midnight before relying on it for precise totals.
- Input activity is only a proxy for studying; use the manual override for reading, lectures, or paper-based work.
