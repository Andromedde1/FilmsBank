const MODES = {
  movies: {
    collection: "movies",
    historyCollection: "history",
    storageKey: "movieBank",
    title: "Банк фильмов",
    subtitle: "Собирайте список фильмов и крутите рулетку",
    itemLabel: "фильм",
    itemLabelPlural: "фильмы",
    historyLabel: "фильмов",
    inputPlaceholder: "Введите название фильма...",
    emptyBank: "Пока нет фильмов. Добавьте первый!",
    emptyRoulette: "Добавьте фильмы в банк, чтобы крутить рулетку.",
    historyTitle: "История выпавших фильмов",
  },
  series: {
    collection: "series",
    historyCollection: "seriesHistory",
    storageKey: "seriesBank",
    title: "Банк сериалов",
    subtitle: "Собирайте список сериалов и крутите рулетку",
    itemLabel: "сериал",
    itemLabelPlural: "сериалы",
    historyLabel: "сериалов",
    inputPlaceholder: "Введите название сериала...",
    emptyBank: "Пока нет сериалов. Добавьте первый!",
    emptyRoulette: "Добавьте сериалы в банк, чтобы крутить рулетку.",
    historyTitle: "История выпавших сериалов",
  },
};

const COLORS = [
  "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e",
  "#00b894", "#00cec9", "#e17055", "#74b9ff",
  "#fab1a0", "#55efc4", "#ffeaa7", "#81ecec",
];

function createBankState() {
  return {
    items: [],
    history: [],
    rotation: 0,
    spinning: false,
    searchQuery: "",
    unsubscribe: null,
    unsubscribeHistory: null,
  };
}

const state = {
  mode: "movies",
  online: false,
  configured: false,
  db: null,
  banks: {
    movies: createBankState(),
    series: createBankState(),
  },
};

const els = {
  globalTabs: document.querySelectorAll(".global-tab"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  appTitle: document.getElementById("app-title"),
  appSubtitle: document.getElementById("app-subtitle"),
  form: document.getElementById("add-form"),
  input: document.getElementById("item-input"),
  searchInput: document.getElementById("search-input"),
  hint: document.getElementById("bank-hint"),
  list: document.getElementById("item-list"),
  emptyBank: document.getElementById("empty-bank"),
  emptySearch: document.getElementById("empty-search"),
  wheel: document.getElementById("wheel"),
  spinBtn: document.getElementById("spin-btn"),
  result: document.getElementById("roulette-result"),
  emptyRoulette: document.getElementById("empty-roulette"),
  syncStatus: document.getElementById("sync-status"),
  setupPanel: document.getElementById("setup-panel"),
  historyBtn: document.getElementById("history-btn"),
  historyCount: document.getElementById("history-count"),
  historyModal: document.getElementById("history-modal"),
  historyTitle: document.getElementById("history-title"),
  historyList: document.getElementById("history-list"),
  historyEmpty: document.getElementById("history-empty"),
  historyClose: document.getElementById("history-close"),
};

const ctx = els.wheel.getContext("2d");

function getModeConfig() {
  return MODES[state.mode];
}

function getBank() {
  return state.banks[state.mode];
}

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
  els.searchInput.disabled = show;
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

function mapHistorySnapshot(snapshot) {
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      title: doc.data().title,
      drawnAt: doc.data().drawnAt?.toMillis?.() || 0,
    }))
    .sort((a, b) => b.drawnAt - a.drawnAt);
}

function formatHistoryDate(timestamp) {
  if (!timestamp) return "Только что";
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function subscribeToItems(mode) {
  if (!state.db) return;

  const bank = state.banks[mode];
  const config = MODES[mode];

  if (bank.unsubscribe) {
    bank.unsubscribe();
  }

  bank.unsubscribe = state.db
    .collection(config.collection)
    .onSnapshot(
      (snapshot) => {
        if (bank.spinning) return;

        bank.items = mapSnapshot(snapshot);
        setOnline(true);

        if (mode === state.mode) {
          renderAll();
        }
      },
      () => {
        setOnline(false);
      }
    );
}

function subscribeToHistory(mode) {
  if (!state.db) return;

  const bank = state.banks[mode];
  const config = MODES[mode];

  if (bank.unsubscribeHistory) {
    bank.unsubscribeHistory();
  }

  bank.unsubscribeHistory = state.db
    .collection(config.historyCollection)
    .onSnapshot(
      (snapshot) => {
        bank.history = mapHistorySnapshot(snapshot);

        if (mode === state.mode) {
          renderHistory();
        }
      },
      () => {
        setOnline(false);
      }
    );
}

function subscribeAll() {
  subscribeToItems("movies");
  subscribeToItems("series");
  subscribeToHistory("movies");
  subscribeToHistory("series");
}

async function addToHistory(mode, title) {
  const config = MODES[mode];
  await state.db.collection(config.historyCollection).add({
    title,
    drawnAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function removeHistoryEntry(id) {
  const config = getModeConfig();
  await state.db.collection(config.historyCollection).doc(id).delete();
}

function filterItemsBySearch(items, query) {
  const normalized = normalizeTitle(query).toLowerCase();
  if (!normalized) return items;

  return items.filter((item) =>
    item.title.toLowerCase().startsWith(normalized)
  );
}

function createHighlightedTitle(title, query) {
  const container = document.createElement("span");
  const normalizedQuery = normalizeTitle(query).toLowerCase();

  if (!normalizedQuery || !title.toLowerCase().startsWith(normalizedQuery)) {
    container.textContent = title;
    return container;
  }

  const matchLength = normalizedQuery.length;
  const highlight = document.createElement("span");
  highlight.className = "search-match";
  highlight.textContent = title.slice(0, matchLength);

  container.append(highlight, document.createTextNode(title.slice(matchLength)));
  return container;
}

function renderHistory() {
  const bank = getBank();
  const config = getModeConfig();
  const hasHistory = bank.history.length > 0;

  els.historyTitle.textContent = config.historyTitle;
  els.historyCount.textContent = String(bank.history.length);
  els.historyCount.classList.toggle("hidden", !hasHistory);
  els.historyEmpty.classList.toggle("hidden", hasHistory);

  els.historyList.innerHTML = "";

  bank.history.forEach((entry) => {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "history-row";

    const info = document.createElement("div");
    info.className = "history-info";

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = entry.title;

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatHistoryDate(entry.drawnAt);

    info.append(title, date);

    const btn = document.createElement("button");
    btn.className = "history-remove-btn";
    btn.type = "button";
    btn.textContent = "Удалить";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removeHistoryEntry(entry.id);
      } catch {
        btn.disabled = false;
      }
    });

    row.append(info, btn);
    li.appendChild(row);
    els.historyList.appendChild(li);
  });
}

function openHistory() {
  els.historyModal.classList.remove("hidden");
  els.historyModal.setAttribute("aria-hidden", "false");
}

function closeHistory() {
  els.historyModal.classList.add("hidden");
  els.historyModal.setAttribute("aria-hidden", "true");
}

async function migrateLocalStorage(mode) {
  if (!state.db) return;

  const config = MODES[mode];
  const bank = state.banks[mode];

  let titles = [];
  try {
    const raw = localStorage.getItem(config.storageKey);
    titles = raw ? JSON.parse(raw) : [];
  } catch {
    titles = [];
  }

  if (!Array.isArray(titles) || titles.length === 0) return;

  const existing = new Set(bank.items.map((item) => item.title.toLowerCase()));

  for (const title of titles) {
    const normalized = normalizeTitle(String(title));
    if (!normalized) continue;
    if (existing.has(normalized.toLowerCase())) continue;

    await state.db.collection(config.collection).add({
      title: normalized,
      titleLower: normalized.toLowerCase(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  localStorage.removeItem(config.storageKey);
}

async function addItem(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return "empty";

  const bank = getBank();
  const config = getModeConfig();

  const exists = bank.items.some(
    (item) => item.title.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) return "duplicate";

  await state.db.collection(config.collection).add({
    title: normalized,
    titleLower: normalized.toLowerCase(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return "ok";
}

async function removeItem(id) {
  const config = getModeConfig();
  await state.db.collection(config.collection).doc(id).delete();
}

function updateModeUI() {
  const config = getModeConfig();
  const bank = getBank();

  els.appTitle.textContent = config.title;
  els.appSubtitle.textContent = config.subtitle;
  els.input.placeholder = config.inputPlaceholder;
  els.emptyBank.textContent = config.emptyBank;
  els.emptyRoulette.textContent = config.emptyRoulette;
  els.searchInput.value = bank.searchQuery;

  els.globalTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.mode);
  });
}

function switchMode(mode) {
  if (mode === state.mode) return;

  state.mode = mode;
  updateModeUI();
  renderAll();
  renderHistory();
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
  const bank = getBank();
  const config = getModeConfig();
  const filtered = filterItemsBySearch(bank.items, bank.searchQuery);
  const hasItems = bank.items.length > 0;
  const hasFiltered = filtered.length > 0;
  const isSearching = Boolean(normalizeTitle(bank.searchQuery));

  els.list.innerHTML = "";
  els.emptyBank.classList.toggle("hidden", hasItems || isSearching);
  els.emptySearch.classList.toggle("hidden", !isSearching || hasFiltered);

  filtered.forEach((item) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "title";
    span.appendChild(createHighlightedTitle(item.title, bank.searchQuery));

    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.type = "button";
    btn.textContent = "Удалить";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removeItem(item.id);
      } catch {
        els.hint.textContent = `Не удалось удалить ${config.itemLabel}. Проверьте связь с облаком.`;
        btn.disabled = false;
      }
    });

    li.append(span, btn);
    els.list.appendChild(li);
  });
}

function renderRouletteControls() {
  const bank = getBank();
  const hasItems = bank.items.length > 0;

  els.spinBtn.disabled = !hasItems || bank.spinning || !state.online || !state.configured;
  els.emptyRoulette.classList.toggle("hidden", hasItems);
  els.wheel.style.display = hasItems ? "block" : "none";
  document.querySelector(".pointer").style.display = hasItems ? "block" : "none";
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
  const bank = getBank();
  const { width, height } = els.wheel;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 8;
  const items = bank.items;

  ctx.clearRect(0, 0, width, height);

  if (items.length === 0) return;

  const slice = (Math.PI * 2) / items.length;

  items.forEach((item, i) => {
    const start = bank.rotation + i * slice;
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
    ctx.font = items.length > 12 ? "bold 11px Segoe UI, sans-serif" : "bold 13px Segoe UI, sans-serif";

    const lines = wrapText(item.title, radius * 0.55);
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
  const bank = getBank();
  const config = getModeConfig();

  if (bank.spinning || bank.items.length === 0 || !state.online) return;

  bank.spinning = true;
  els.spinBtn.disabled = true;
  els.result.textContent = "Крутим...";
  els.result.classList.add("spinning");

  const items = [...bank.items];
  const winnerIndex = Math.floor(Math.random() * items.length);
  const slice = (Math.PI * 2) / items.length;
  const extraSpins = 4 + Math.floor(Math.random() * 3);
  const targetMid = winnerIndex * slice + slice / 2;
  const targetRotation = extraSpins * Math.PI * 2 + (-Math.PI / 2 - targetMid);
  const startRotation = bank.rotation;
  const delta = targetRotation - startRotation;
  const duration = 4200;
  const startTime = performance.now();
  const mode = state.mode;

  function animate(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    bank.rotation = startRotation + delta * eased;
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      const winner = items[winnerIndex];
      bank.rotation = bank.rotation % (Math.PI * 2);
      finishSpin(mode, winner, config);
    }
  }

  requestAnimationFrame(animate);
}

async function finishSpin(mode, winner, config) {
  const bank = state.banks[mode];

  els.result.classList.remove("spinning");

  try {
    await state.db.collection(config.collection).doc(winner.id).delete();
    await addToHistory(mode, winner.title);
    bank.items = bank.items.filter((item) => item.id !== winner.id);
    bank.spinning = false;

    if (mode === state.mode) {
      renderAll();

      if (bank.items.length > 0) {
        els.result.textContent = `Выпало: «${winner.title}» — удалён из банка`;
      } else {
        els.result.textContent = `Выпало: «${winner.title}» — банк пуст`;
      }
    } else {
      bank.spinning = false;
    }
  } catch {
    bank.spinning = false;
    if (mode === state.mode) {
      renderAll();
      els.result.textContent = `Не удалось удалить ${config.itemLabel} из облака.`;
    }
  }
}

function renderAll() {
  renderBank();
  renderRouletteControls();
  drawWheel();
}

els.globalTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

els.searchInput.addEventListener("input", () => {
  getBank().searchQuery = els.searchInput.value;
  renderBank();
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.hint.textContent = "";

  const config = getModeConfig();

  if (!state.configured) {
    els.hint.textContent = "Сначала настройте Firebase (см. инструкцию выше).";
    return;
  }

  const value = els.input.value;
  if (!normalizeTitle(value)) {
    els.hint.textContent = `Введите название ${config.itemLabel}а.`;
    return;
  }

  const submitBtn = els.form.querySelector("button[type='submit']");
  submitBtn.disabled = true;

  try {
    const result = await addItem(value);
    if (result === "duplicate") {
      els.hint.textContent = `Такой ${config.itemLabel} уже есть в банке.`;
    } else {
      els.input.value = "";
      els.input.focus();
    }
  } catch {
    els.hint.textContent = `Не удалось добавить ${config.itemLabel}. Проверьте Firebase.`;
  } finally {
    submitBtn.disabled = false;
  }
});

els.spinBtn.addEventListener("click", spinWheel);

els.historyBtn.addEventListener("click", openHistory);
els.historyClose.addEventListener("click", closeHistory);
els.historyModal.querySelector("[data-close-history]").addEventListener("click", closeHistory);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.historyModal.classList.contains("hidden")) {
    closeHistory();
  }
});

async function boot() {
  updateModeUI();

  if (!initFirebase()) {
    renderHistory();
    renderAll();
    return;
  }

  subscribeAll();
  await migrateLocalStorage("movies");
  await migrateLocalStorage("series");
  renderAll();
  renderHistory();
}

boot();
