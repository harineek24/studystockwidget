// Electron's app module manages the application lifecycle.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, powerMonitor } = require("electron");
// These Node modules let us read/write local history and build safe file paths.
const fs = require("node:fs");
const path = require("node:path");

// Store history in Electron's per-user app-data folder, not beside the program.
const DATA_FILE = path.join(app.getPath("userData"), "history.json");
// The tracking window is 6 AM inclusive through 9 PM exclusive, using local time.
const START_HOUR = 6;
const END_HOUR = 21;
// After this many seconds without mouse/keyboard input, the app considers you idle.
const IDLE_SECONDS = 60;
// Example symbolic cost: $30 per idle hour. Change this in Settings/code later.
const COST_PER_HOUR = 30;
// The symbolic stock starts at this value each day. Studying adds value; idle time removes it.
const OPENING_STOCK_VALUE = 100;
// The global input hook observes activity across apps; it does not record key contents.
let uIOhook = null;
try {
  ({ uIOhook } = require("uiohook-napi"));
} catch (error) {
  console.warn("Global input monitoring unavailable; use the study hotkey instead.", error.message);
}

// These variables represent the app's current desktop objects and tracking state.
let win;
let tray;
let lastInputAt = Date.now();
let manualStudyUntil = 0;
let isPaused = false;
let lastTickAt = Date.now();
let lastSavedAt = 0;
let sleepStartedAt = null;
let history = { days: {} };

// Read previously saved days when the app starts.
function loadHistory() {
  try {
    history = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!history.days) history.days = {};
  } catch {
    history = { days: {} };
  }
}

// Write history safely enough for a small local app.
function saveHistory() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), "utf8");
  lastSavedAt = Date.now();
}

// Return today's date as YYYY-MM-DD in the computer's local timezone.
function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Ensure today's record exists, then return it for updates.
function todayRecord() {
  const key = todayKey();
  if (!history.days[key]) {
    history.days[key] = { productiveSeconds: 0, idleSeconds: 0, closingValue: 0 };
  }
  return history.days[key];
}

// Determine whether the current local time is inside the allowed tracking window.
function inTrackingWindow(date = new Date()) {
  const hour = date.getHours();
  return hour >= START_HOUR && hour < END_HOUR;
}

// A manual override lasts until toggled off or until the tracking window ends.
function manuallyStudying(now = Date.now()) {
  return now < manualStudyUntil;
}

// Recent input or the manual override means "probably studying".
function currentlyStudying(now = Date.now()) {
  return manuallyStudying(now) || now - lastInputAt <= IDLE_SECONDS * 1000;
}

// Split elapsed time at minute-sized steps so crossing 6 AM, 9 PM, or midnight is handled.
function updateCounters(now = Date.now()) {
  // Use a fresh current time and avoid counting backwards if the system clock changes.
  const from = Math.min(lastTickAt, now);
  const elapsed = Math.max(0, now - from);
  // Walk the elapsed interval in chunks of at most one second for simple boundary handling.
  const stepMs = 1000;
  for (let t = from; t < now; t += stepMs) {
    const chunkEnd = Math.min(now, t + stepMs);
    const seconds = (chunkEnd - t) / 1000;
    const date = new Date(t);
    if (!inTrackingWindow(date) || isPaused || sleepStartedAt !== null) continue;
    const record = todayRecord();
    if (currentlyStudying(t)) {
      record.productiveSeconds += seconds;
    } else {
      record.idleSeconds += seconds;
    }
  }
  lastTickAt = now;
  // Save periodically; also save immediately when the date changes or the app exits.
  if (now - lastSavedAt > 10000) saveHistory();
}

// Compute the symbolic idle cost and current stock value for today.
function idleCost(record = todayRecord()) {
  return record.idleSeconds / 3600 * COST_PER_HOUR;
}
function stockValue(record = todayRecord()) {
  const netSeconds = record.productiveSeconds - record.idleSeconds;
  return Math.max(0, OPENING_STOCK_VALUE + (netSeconds / 3600) * COST_PER_HOUR);
}

// Create the small always-on-top sticky-note window.
function createWindow() {
  win = new BrowserWindow({
    width: 300,
    height: 290,
    minWidth: 260,
    minHeight: 250,
    resizable: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: "#fff8c9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile("index.html");
  // Closing the note hides it so background tracking can continue.
  win.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

// Build the tray menu so the app can be restored or quit without the note.
function createTray() {
  tray = new Tray(path.join(__dirname, "tray.png"));
  tray.setToolTip("Study Stock");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Study Stock", click: () => win.show() },
    { label: "Toggle study override (Ctrl+Shift+S)", click: toggleManualStudy },
    { label: "Pause tracking", type: "checkbox", checked: isPaused, click: (item) => { isPaused = item.checked; } },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on("double-click", () => win.show());
}

// Toggle a manual study override for 30 minutes; press again to turn it off.
function toggleManualStudy() {
  manualStudyUntil = manuallyStudying() ? 0 : Date.now() + 30 * 60 * 1000;
  lastInputAt = Date.now();
  sendState();
}

// Send the latest values to the visible window, if it exists.
function sendState() {
  if (!win || win.isDestroyed()) return;
  const record = todayRecord();
  win.webContents.send("state:update", {
    studying: inTrackingWindow() && !isPaused && currentlyStudying(),
    paused: isPaused,
    inWindow: inTrackingWindow(),
    productiveSeconds: record.productiveSeconds,
    idleSeconds: record.idleSeconds,
    idleCost: idleCost(record),
    stockValue: stockValue(record),
    stockDeltaPerMinute: inTrackingWindow() && !isPaused ? (currentlyStudying() ? COST_PER_HOUR / 60 : -COST_PER_HOUR / 60) : 0,
    lifetimeSeconds: Object.values(history.days).reduce((sum, day) => sum + day.productiveSeconds, 0),
    days: Object.entries(history.days).sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({
      date, productiveMinutes: Math.round(day.productiveSeconds / 60), idleMinutes: Math.round(day.idleSeconds / 60)
    }))
  });
}

// Receive only the actions the renderer needs; it cannot access Node or arbitrary files.
ipcMain.handle("state:get", () => {
  updateCounters();
  const record = todayRecord();
  return {
    studying: inTrackingWindow() && !isPaused && currentlyStudying(),
    paused: isPaused,
    inWindow: inTrackingWindow(),
    productiveSeconds: record.productiveSeconds,
    idleSeconds: record.idleSeconds,
    idleCost: idleCost(record),
    stockValue: stockValue(record),
    stockDeltaPerMinute: inTrackingWindow() && !isPaused ? (currentlyStudying() ? COST_PER_HOUR / 60 : -COST_PER_HOUR / 60) : 0,
    lifetimeSeconds: Object.values(history.days).reduce((sum, day) => sum + day.productiveSeconds, 0),
    days: Object.entries(history.days).sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({
      date, productiveMinutes: Math.round(day.productiveSeconds / 60), idleMinutes: Math.round(day.idleSeconds / 60)
    }))
  };
});
ipcMain.handle("study:toggle", () => { toggleManualStudy(); return manuallyStudying(); });
ipcMain.handle("tracking:pause", () => { isPaused = !isPaused; sendState(); return isPaused; });
ipcMain.handle("window:hide", () => { win.hide(); });

// Start after Electron is ready, then restore history and create the desktop UI.
app.whenReady().then(() => {
  loadHistory();
  createWindow();
  // A simple transparent 1x1 PNG tray icon is created by the setup instructions below.
  createTray();
  // Ctrl+Shift+S toggles the manual override even when another app is focused.
  globalShortcut.register("Control+Shift+S", toggleManualStudy);
  // Global hooks detect mouse/keyboard activity without recording actual key values.
  if (uIOhook) {
    uIOhook.on("mousemove", () => { lastInputAt = Date.now(); });
    uIOhook.on("mousedown", () => { lastInputAt = Date.now(); });
    uIOhook.on("keydown", () => { lastInputAt = Date.now(); });
    uIOhook.start();
  }
  // Stop counting while Windows is asleep; resume from the current time after wake.
  powerMonitor.on("suspend", () => {
    updateCounters();
    sleepStartedAt = Date.now();
    saveHistory();
  });
  powerMonitor.on("resume", () => {
    sleepStartedAt = null;
    lastInputAt = Date.now();
    lastTickAt = Date.now();
    sendState();
  });
  // Recompute from timestamps rather than trusting a counter that can drift.
  setInterval(() => { updateCounters(); sendState(); }, 1000);
  // Open a fresh window if macOS-style activation happens; harmless on Windows.
  app.on("activate", () => { if (win) win.show(); });
});

// Clean up global hooks and save data before the process exits.
app.on("before-quit", () => {
  app.isQuitting = true;
  updateCounters();
  saveHistory();
  globalShortcut.unregisterAll();
  if (uIOhook) uIOhook.stop();
});

// Hide rather than destroy the app when the window is closed.
app.on("window-all-closed", (event) => { event.preventDefault?.(); });
