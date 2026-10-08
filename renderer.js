// Find the HTML elements that will display the live numbers and chart.
const moneyEl = document.getElementById("money");
const rateEl = document.getElementById("rate");
const statusEl = document.getElementById("status");
const todayEl = document.getElementById("todayMinutes");
const lifetimeEl = document.getElementById("lifetimeMinutes");
const studyButton = document.getElementById("studyButton");
const pauseButton = document.getElementById("pauseButton");
const chartStudy = document.getElementById("chartStudy");
const chartIdle = document.getElementById("chartIdle");
const chartClosed = document.getElementById("chartClosed");
const chartLabels = document.getElementById("chartLabels");
const trendEl = document.getElementById("trend");

// Keep a short in-memory sample of the live stock value for the scrolling chart.
const chartSamples = [];
let lastSampleAt = 0;

// Format seconds as whole minutes for the compact note.
function minutes(seconds) {
  return `${Math.floor(seconds / 60)} min`;
}

function modeFor(state) {
  if (state.paused || !state.inWindow) return "closed";
  return state.studying ? "study" : "idle";
}

// Draw the latest 60 seconds; studying is green, idle loss is red, closed/paused is gray.
function drawChart() {
  if (chartSamples.length < 2) {
    chartStudy.setAttribute("d", "");
    chartIdle.setAttribute("d", "");
    chartClosed.setAttribute("d", "");
    return;
  }
  const values = chartSamples.map(sample => sample.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 0.05) { min -= 0.5; max += 0.5; }
  const points = chartSamples.map((sample, index) => ({
    x: 4 + index * (252 / (chartSamples.length - 1)),
    y: 52 - ((sample.value - min) / (max - min)) * 44,
    mode: sample.mode
  }));
  const paths = { study: [], idle: [], closed: [] };
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const mode = current.mode;
    paths[mode].push(`M ${previous.x},${previous.y} L ${current.x},${current.y}`);
  }
  chartStudy.setAttribute("d", paths.study.join(" "));
  chartIdle.setAttribute("d", paths.idle.join(" "));
  chartClosed.setAttribute("d", paths.closed.join(" "));
}

// Paint the interface from the main process state.
function render(state) {
  const now = Date.now();
  const mode = modeFor(state);
  moneyEl.textContent = `$${state.stockValue.toFixed(2)}`;
  todayEl.textContent = minutes(state.productiveSeconds);
  lifetimeEl.textContent = minutes(state.lifetimeSeconds);

  if (state.paused) {
    statusEl.textContent = "Tracking paused";
    rateEl.textContent = "PAUSED";
    rateEl.style.color = "#77734d";
  } else if (!state.inWindow) {
    statusEl.textContent = "Market closed · 6 AM–9 PM";
    rateEl.textContent = "NO CHANGE";
    rateEl.style.color = "#77734d";
  } else if (state.studying) {
    statusEl.textContent = "● Studying · stock rising";
    rateEl.textContent = `+$${Math.abs(state.stockDeltaPerMinute).toFixed(2)}/min`;
    rateEl.style.color = "#16834a";
  } else {
    statusEl.textContent = "● Idle · stock falling";
    rateEl.textContent = `−$${Math.abs(state.stockDeltaPerMinute).toFixed(2)}/min`;
    rateEl.style.color = "#dc3636";
  }

  studyButton.textContent = state.studying ? "Stop study override" : "I'm studying";
  pauseButton.textContent = state.paused ? "Resume" : "Pause";
  trendEl.textContent = mode === "study" ? "GAINING" : mode === "idle" ? "LOSING" : "HOLD";

  // Add at most one point per second even if both IPC sources render together.
  if (!lastSampleAt || now - lastSampleAt >= 900) {
    chartSamples.push({ value: state.stockValue, mode });
    if (chartSamples.length > 60) chartSamples.shift();
    lastSampleAt = now;
  } else if (chartSamples.length) {
    chartSamples[chartSamples.length - 1] = { value: state.stockValue, mode };
  }
  drawChart();
}

// Wire buttons to the narrow API exposed by preload.js.
studyButton.addEventListener("click", async () => {
  await window.studyStock.toggleStudy();
  render(await window.studyStock.getState());
});
pauseButton.addEventListener("click", async () => {
  await window.studyStock.togglePause();
  render(await window.studyStock.getState());
});
document.getElementById("hideButton").addEventListener("click", () => window.studyStock.hide());

// Render initial state, then accept live updates from the main process.
window.studyStock.getState().then(render);
window.studyStock.onState(render);
