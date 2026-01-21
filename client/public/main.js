(() => {
  const palette = [
    "#0ea5e9",
    "#22c55e",
    "#f97316",
    "#ef4444",
    "#14b8a6",
    "#6366f1",
    "#eab308",
    "#0f172a"
  ];

  const board = document.getElementById("board");
  const overlay = document.getElementById("overlay");
  const cursorLayer = document.getElementById("cursor-layer");
  const userList = document.getElementById("user-list");
  const roomName = document.getElementById("room-name");
  const statusEl = document.getElementById("status");
  const latencyEl = document.getElementById("latency");
  const themeToggle = document.getElementById("theme-toggle");
  const toolChip = document.getElementById("tool-chip");
  const widthChip = document.getElementById("width-chip");

  const toolSelect = document.getElementById("tool");
  const widthInput = document.getElementById("width");
  const swatches = document.getElementById("swatches");
  const undoBtn = document.getElementById("undo");
  const redoBtn = document.getElementById("redo");
  const clearBtn = document.getElementById("clear");
  const toolButtons = Array.from(document.querySelectorAll(".tool-btn"));

  const canvasManager = new window.CanvasManager(board, overlay);
  const socketClient = new window.WebSocketClient();

  const state = {
    userId: null,
    room: null,
    users: new Map(),
    currentTool: "brush",
    currentColor: palette[0],
    currentWidth: Number(widthInput.value),
    drawing: false,
    currentStrokeId: null,
    bufferedPoints: [],
    lastSendTime: 0,
    lastCursorSend: 0
  };

  const THEME_KEY = "collab-canvas-theme";

  function getRoomFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("room") || "default";
  }

  function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function toNormalizedPoint(event) {
    const rect = board.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
      t: Date.now()
    };
  }

  function getWidthNorm() {
    const rect = board.getBoundingClientRect();
    return state.currentWidth / rect.width;
  }

  function createStrokeId() {
    return `${state.userId}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  }

  function addUser(user) {
    state.users.set(user.id, user);
    renderUsers();
  }

  function removeUser(userId) {
    state.users.delete(userId);
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) cursor.remove();
    renderUsers();
  }

  function renderUsers() {
    userList.innerHTML = "";
    for (const user of state.users.values()) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "user-dot";
      dot.style.background = user.color;
      const name = document.createElement("span");
      name.textContent = user.name;
      li.append(dot, name);
      userList.appendChild(li);
    }
  }

  function upsertCursor(userId, payload) {
    let cursor = document.getElementById(`cursor-${userId}`);
    const user = state.users.get(userId);
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.className = "cursor";
      cursor.id = `cursor-${userId}`;
      const dot = document.createElement("span");
      dot.className = "cursor-dot";
      const label = document.createElement("span");
      label.className = "cursor-label";
      cursor.append(dot, label);
      cursorLayer.appendChild(cursor);
    }
    const dot = cursor.querySelector(".cursor-dot");
    const label = cursor.querySelector(".cursor-label");
    if (user) {
      dot.style.background = user.color;
      label.textContent = user.name;
    }
    const rect = board.getBoundingClientRect();
    cursor.style.left = `${payload.x * rect.width}px`;
    cursor.style.top = `${payload.y * rect.height}px`;
    cursor.style.opacity = payload.drawing ? "1" : "0.7";
  }

  function resize() {
    const rect = board.parentElement.getBoundingClientRect();
    canvasManager.setSize(rect.width, rect.height);
  }

  function initSwatches() {
    swatches.innerHTML = "";
    palette.forEach((color, index) => {
      const swatch = document.createElement("button");
      swatch.className = "swatch" + (index === 0 ? " active" : "");
      swatch.style.background = color;
      swatch.addEventListener("click", () => {
        state.currentColor = color;
        document.querySelectorAll(".swatch").forEach((el) => el.classList.remove("active"));
        swatch.classList.add("active");
      });
      swatches.appendChild(swatch);
    });
  }

  function updateToolChip() {
    if (toolChip) toolChip.textContent = toolSelect.options[toolSelect.selectedIndex].textContent;
  }

  function updateWidthChip() {
    if (widthChip) widthChip.textContent = String(state.currentWidth);
  }

  function updateToolButtons() {
    toolButtons.forEach((button) => {
      const isActive = button.dataset.tool === state.currentTool;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setTool(tool) {
    if (!tool) return;
    state.currentTool = tool;
    toolSelect.value = tool;
    updateToolChip();
    updateToolButtons();
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
    themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    const label = themeToggle.querySelector(".theme-text");
    if (label) {
      label.textContent = isDark ? "Light" : "Dark";
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    applyTheme(theme);
    themeToggle.addEventListener("click", () => {
      const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function startStroke(point) {
    state.drawing = true;
    state.currentStrokeId = createStrokeId();
    state.bufferedPoints = [];
    state.lastSendTime = 0;
    const stroke = {
      id: state.currentStrokeId,
      userId: state.userId,
      color: state.currentTool === "eraser" ? "#000" : state.currentColor,
      widthNorm: getWidthNorm(),
      tool: state.currentTool,
      points: [point],
      seq: Date.now()
    };
    canvasManager.updateInProgress(stroke);
    socketClient.send("stroke:start", {
      id: stroke.id,
      color: stroke.color,
      widthNorm: stroke.widthNorm,
      tool: stroke.tool,
      points: stroke.points
    });
  }

  function addPoint(point) {
    if (!state.drawing || !state.currentStrokeId) return;
    state.bufferedPoints.push(point);
    canvasManager.appendInProgressPoints(state.currentStrokeId, [point]);
    flushPoints();
  }

  function flushPoints(force = false) {
    const now = Date.now();
    if (!force && now - state.lastSendTime < 16) return;
    if (!state.bufferedPoints.length) return;
    socketClient.send("stroke:points", {
      id: state.currentStrokeId,
      points: state.bufferedPoints
    });
    state.bufferedPoints = [];
    state.lastSendTime = now;
  }

  function endStroke() {
    if (!state.drawing) return;
    flushPoints(true);
    socketClient.send("stroke:end", { id: state.currentStrokeId });
    state.drawing = false;
    state.currentStrokeId = null;
  }

  function sendCursor(point, drawing) {
    const now = Date.now();
    if (now - state.lastCursorSend < 50 && !drawing) return;
    socketClient.send("cursor", { x: point.x, y: point.y, drawing });
    state.lastCursorSend = now;
  }

  function attachPointerEvents() {
    board.addEventListener("pointerdown", (event) => {
      if (!state.userId) return;
      board.setPointerCapture(event.pointerId);
      const point = toNormalizedPoint(event);
      startStroke(point);
      sendCursor(point, true);
    });

    board.addEventListener("pointermove", (event) => {
      const point = toNormalizedPoint(event);
      if (state.drawing) {
        addPoint(point);
      }
      sendCursor(point, state.drawing);
    });

    const stopDrawing = () => endStroke();
    board.addEventListener("pointerup", stopDrawing);
    board.addEventListener("pointerleave", stopDrawing);
    board.addEventListener("pointercancel", stopDrawing);
  }

  function bindControls() {
    toolSelect.addEventListener("change", (event) => {
      setTool(event.target.value);
    });
    widthInput.addEventListener("input", (event) => {
      state.currentWidth = Number(event.target.value);
      updateWidthChip();
    });
    undoBtn.addEventListener("click", () => socketClient.send("history:undo"));
    redoBtn.addEventListener("click", () => socketClient.send("history:redo"));
    clearBtn.addEventListener("click", () => {
      if (!window.confirm("Clear the entire board for everyone in the room?")) return;
      socketClient.send("history:clear");
    });

    toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setTool(button.dataset.tool);
      });
    });
  }

  function setupSocket() {
    socketClient.on("connect", () => {
      setStatus("Connected");
    });

    socketClient.on("init", (payload) => {
      state.userId = payload.userId;
      state.room = payload.room;
      roomName.textContent = payload.room;
      state.users.clear();
      payload.users.forEach(addUser);
      canvasManager.setHistory(payload.history || []);
      setStatus("Ready");
    });

    socketClient.on("user:join", ({ user }) => addUser(user));
    socketClient.on("user:leave", ({ userId }) => removeUser(userId));

    socketClient.on("cursor", (payload) => {
      upsertCursor(payload.userId, payload);
    });

    socketClient.on("stroke:start", ({ stroke }) => {
      canvasManager.updateInProgress(stroke);
    });

    socketClient.on("stroke:points", ({ id, points }) => {
      canvasManager.appendInProgressPoints(id, points);
    });

    socketClient.on("stroke:end", ({ id, stroke }) => {
      canvasManager.endInProgress(id);
      if (stroke) {
        canvasManager.addHistoryStroke(stroke);
      }
    });

    socketClient.on("stroke:cancel", ({ id }) => {
      canvasManager.clearInProgress(id);
    });

    socketClient.on("history", ({ history }) => {
      canvasManager.setHistory(history || []);
    });

    socketClient.on("latency:pong", ({ now }) => {
      const ping = Date.now() - now;
      latencyEl.textContent = `${ping} ms`;
    });
  }

  function startLatencyMonitor() {
    setInterval(() => {
      socketClient.send("latency:ping", { now: Date.now() });
    }, 2000);
  }

  function init() {
    initTheme();
    initSwatches();
    setTool(toolSelect.value);
    updateWidthChip();
    attachPointerEvents();
    bindControls();
    resize();
    window.addEventListener("resize", resize);
    setupSocket();

    const room = getRoomFromUrl();
    socketClient.join(room, null);
    startLatencyMonitor();
  }

  init();
})();
