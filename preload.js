// Expose a tiny, controlled API to the page instead of exposing Node.js itself.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studyStock", {
  // Ask the main process for the latest counters.
  getState: () => ipcRenderer.invoke("state:get"),
  // Toggle the manual study override.
  toggleStudy: () => ipcRenderer.invoke("study:toggle"),
  // Pause or resume all tracking.
  togglePause: () => ipcRenderer.invoke("tracking:pause"),
  // Hide the widget while leaving the app running.
  hide: () => ipcRenderer.invoke("window:hide"),
  // Subscribe to updates pushed by the main process.
  onState: (callback) => ipcRenderer.on("state:update", (_event, state) => callback(state))
});
