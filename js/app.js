const STORAGE_KEY = "movieBank";

const COLORS = [
  "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e",
  "#00b894", "#00cec9", "#e17055", "#74b9ff",
  "#fab1a0", "#55efc4", "#ffeaa7", "#81ecec",
];

const state = {
  movies: [],
  rotation: 0,
  spinning: false,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  form: document.getElementById("add-form"),
  input: document.getElementById("movie-input"),
  hint: document.getElementById("bank-hint"),
  list: document.getElementById("movie-list"),
  emptyBank: document.getElementById("empty-bank"),
  wheel: document.getElementById("wheel"),
  spinBtn: document.getElementById("spin-btn"),
  result: document.getElementById("roulette-result"),
  emptyRoulette: document.getElementById("empty-roulette"),
};

const ctx = els.wheel.getContext("2d");

function loadMovies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.movies = Array.isArray(parsed) ? dedupeMovies(parsed) : [];
    saveMovies();
  } catch {
    state.movies = [];
  }
}

function saveMovies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.movies));
}

function normalizeTitle(title) {
  return title.trim().replace(/\s+/g, " ");
}

function dedupeMovies(movies) {
  const seen = new Set();
  const result = [];
  for (const movie of movies) {
    const title = normalizeTitle(String(movie));
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(title);
  }
  return result;
}

function addMovie(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;

  const exists = state.movies.some(
    (m) => m.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) return false;

  state.movies.push(normalized);
  saveMovies();
  return true;
}

function removeMovie(title) {
  const key = title.toLowerCase();
  state.movies = state.movies.filter((m) => m.toLowerCase() !== key);
  saveMovies();
}

function switchTab(tabId) {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });
  els.panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  if (tabId === "roulette") {
    drawWheel();
  }
}

function renderBank() {
  els.list.innerHTML = "";
  const hasMovies = state.movies.length > 0;

  els.emptyBank.classList.toggle("hidden", hasMovies);

  state.movies.forEach((title) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "title";
    span.textContent = title;

    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.type = "button";
    btn.textContent = "Удалить";
    btn.addEventListener("click", () => {
      removeMovie(title);
      renderAll();
    });

    li.append(span, btn);
    els.list.appendChild(li);
  });
}

function renderRouletteControls() {
  const hasMovies = state.movies.length > 0;
  els.spinBtn.disabled = !hasMovies || state.spinning;
  els.emptyRoulette.classList.toggle("hidden", hasMovies);
  els.wheel.style.display = hasMovies ? "block" : "none";
  document.querySelector(".pointer").style.display = hasMovies ? "block" : "none";
}

function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function drawWheel() {
  const { width, height } = els.wheel;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 8;
  const movies = state.movies;

  ctx.clearRect(0, 0, width, height);

  if (movies.length === 0) return;

  const slice = (Math.PI * 2) / movies.length;

  movies.forEach((title, i) => {
    const start = state.rotation + i * slice;
    const end = start + slice;
    const mid = start + slice / 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = movies.length > 12 ? "bold 11px Segoe UI, sans-serif" : "bold 13px Segoe UI, sans-serif";

    const lines = wrapText(title, radius * 0.55);
    const lineHeight = 15;
    const startY = -(lines.length - 1) * lineHeight / 2;

    lines.forEach((line, idx) => {
      ctx.fillText(line, radius - 18, startY + idx * lineHeight);
    });
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1d27";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function spinWheel() {
  if (state.spinning || state.movies.length === 0) return;

  state.spinning = true;
  els.spinBtn.disabled = true;
  els.result.textContent = "Крутим...";
  els.result.classList.add("spinning");

  const movies = state.movies;
  const winnerIndex = Math.floor(Math.random() * movies.length);
  const slice = (Math.PI * 2) / movies.length;
  const extraSpins = 4 + Math.floor(Math.random() * 3);
  const targetMid = winnerIndex * slice + slice / 2;
  const targetRotation = extraSpins * Math.PI * 2 + (-Math.PI / 2 - targetMid);
  const startRotation = state.rotation;
  const delta = targetRotation - startRotation;
  const duration = 4200;
  const startTime = performance.now();

  function animate(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    state.rotation = startRotation + delta * eased;
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      const winner = movies[winnerIndex];
      state.rotation = state.rotation % (Math.PI * 2);
      finishSpin(winner);
    }
  }

  requestAnimationFrame(animate);
}

function finishSpin(winner) {
  els.result.textContent = `Выпало: «${winner}»`;
  els.result.classList.remove("spinning");

  removeMovie(winner);
  state.spinning = false;
  renderAll();

  if (state.movies.length > 0) {
    els.result.textContent = `Выпало: «${winner}» — удалён из банка`;
  } else {
    els.result.textContent = `Выпало: «${winner}» — банк пуст`;
  }
}

function renderAll() {
  renderBank();
  renderRouletteControls();
  drawWheel();
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  els.hint.textContent = "";

  const value = els.input.value;
  const added = addMovie(value);

  if (!normalizeTitle(value)) {
    els.hint.textContent = "Введите название фильма.";
    return;
  }

  if (!added) {
    els.hint.textContent = "Такой фильм уже есть в банке.";
    return;
  }

  els.input.value = "";
  els.input.focus();
  renderAll();
});

els.spinBtn.addEventListener("click", spinWheel);

loadMovies();
renderAll();
