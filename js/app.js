const STORAGE_KEY = "movieBank";
const COLLECTION = "movies";

const COLORS = [
  "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e",
  "#00b894", "#00cec9", "#e17055", "#74b9ff",
  "#fab1a0", "#55efc4", "#ffeaa7", "#81ecec",
];

const state = {
  movies: [],
  rotation: 0,
  spinning: false,
  online: false,
  configured: false,
  db: null,
  unsubscribe: null,
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
  syncStatus: document.getElementById("sync-status"),
  setupPanel: document.getElementById("setup-panel"),
};

const ctx = els.wheel.getContext("2d");

function normalizeTitle(title) {
  return title.trim().replace(/\s+/g, " ");
}

function isFirebaseConfigured() {
  const config = window.FIREBASE_CONFIG;
  return Boolean(
    config &&
    config.apiKey &&
    config.projectId &&
    config.appId
  );
}

function setOnline(online, message) {
  state.online = online;
  if (!els.syncStatus) return;

  if (message) {
    els.syncStatus.textContent = message;
  } else {
    els.syncStatus.textContent = online
      ? "Общий банк — синхронизирован"
      : "Нет связи с облаком";
  }

  els.syncStatus.classList.toggle("offline", !online);
}

function showSetupPanel(show) {
  els.setupPanel.classList.toggle("hidden", !show);
  els.form.querySelector("button[type='submit']").disabled = show;
  els.input.disabled = show;
}

function initFirebase() {
  if (!isFirebaseConfigured()) {
    state.configured = false;
    showSetupPanel(true);
    setOnline(false, "Firebase не настроен");
    return false;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }

  state.db = firebase.firestore();
  state.configured = true;
  showSetupPanel(false);
  return true;
}

function mapSnapshot(snapshot) {
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      title: doc.data().title,
      createdAt: doc.data().createdAt?.toMillis?.() || 0,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title, "ru"));
}

function subscribeToMovies() {
  if (!state.db) return;

  if (state.unsubscribe) {
    state.unsubscribe();
  }

  state.unsubscribe = state.db
    .collection(COLLECTION)
    .onSnapshot(
      (snapshot) => {
        if (state.spinning) return;

        state.movies = mapSnapshot(snapshot);
        setOnline(true);
        renderAll();
      },
      () => {
        setOnline(false);
      }
    );
}

async function migrateLocalStorage() {
  if (!state.db) return;

  let titles = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    titles = raw ? JSON.parse(raw) : [];
  } catch {
    titles = [];
  }

  if (!Array.isArray(titles) || titles.length === 0) return;

  const existing = new Set(state.movies.map((movie) => movie.title.toLowerCase()));

  for (const title of titles) {
    const normalized = normalizeTitle(String(title));
    if (!normalized) continue;
    if (existing.has(normalized.toLowerCase())) continue;

    await state.db.collection(COLLECTION).add({
      title: normalized,
      titleLower: normalized.toLowerCase(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  localStorage.removeItem(STORAGE_KEY);
}

async function addMovie(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return "empty";

  const exists = state.movies.some(
    (movie) => movie.title.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) return "duplicate";

  await state.db.collection(COLLECTION).add({
    title: normalized,
    titleLower: normalized.toLowerCase(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return "ok";
}

async function removeMovie(id) {
  await state.db.collection(COLLECTION).doc(id).delete();
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

  state.movies.forEach((movie) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "title";
    span.textContent = movie.title;

    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.type = "button";
    btn.textContent = "Удалить";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removeMovie(movie.id);
      } catch {
        els.hint.textContent = "Не удалось удалить фильм. Проверьте связь с облаком.";
        btn.disabled = false;
      }
    });

    li.append(span, btn);
    els.list.appendChild(li);
  });
}

function renderRouletteControls() {
  const hasMovies = state.movies.length > 0;
  els.spinBtn.disabled = !hasMovies || state.spinning || !state.online || !state.configured;
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

  movies.forEach((movie, i) => {
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

    const lines = wrapText(movie.title, radius * 0.55);
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
  if (state.spinning || state.movies.length === 0 || !state.online) return;

  state.spinning = true;
  els.spinBtn.disabled = true;
  els.result.textContent = "Крутим...";
  els.result.classList.add("spinning");

  const movies = [...state.movies];
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

async function finishSpin(winner) {
  els.result.classList.remove("spinning");

  try {
    await removeMovie(winner.id);
    state.movies = state.movies.filter((movie) => movie.id !== winner.id);
    state.spinning = false;
    renderAll();

    if (state.movies.length > 0) {
      els.result.textContent = `Выпало: «${winner.title}» — удалён из банка`;
    } else {
      els.result.textContent = `Выпало: «${winner.title}» — банк пуст`;
    }
  } catch {
    state.spinning = false;
    renderAll();
    els.result.textContent = "Не удалось удалить фильм из облака.";
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

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.hint.textContent = "";

  if (!state.configured) {
    els.hint.textContent = "Сначала настройте Firebase (см. инструкцию выше).";
    return;
  }

  const value = els.input.value;
  if (!normalizeTitle(value)) {
    els.hint.textContent = "Введите название фильма.";
    return;
  }

  const submitBtn = els.form.querySelector("button[type='submit']");
  submitBtn.disabled = true;

  try {
    const result = await addMovie(value);
    if (result === "duplicate") {
      els.hint.textContent = "Такой фильм уже есть в банке.";
    } else {
      els.input.value = "";
      els.input.focus();
    }
  } catch {
    els.hint.textContent = "Не удалось добавить фильм. Проверьте Firebase.";
  } finally {
    submitBtn.disabled = false;
  }
});

els.spinBtn.addEventListener("click", spinWheel);

async function boot() {
  if (!initFirebase()) {
    renderAll();
    return;
  }

  subscribeToMovies();
  await migrateLocalStorage();
  renderAll();
}

boot();
