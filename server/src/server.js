const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  getRoom,
  createUser,
  addUser,
  removeUser,
  listUsers,
  startStroke,
  appendStrokePoints,
  endStroke,
  cancelStroke,
  undo,
  redo,
  clearAll,
  nextSeq
} = require("./rooms");
const { buildStroke, normalizePoint } = require("./drawing-state");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CLIENT_DIR = path.join(__dirname, "..", "..", "client", "public");
app.use(express.static(CLIENT_DIR));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  let roomId = "default";
  let user = null;

  socket.on("join", ({ room = "default", name }) => {
    roomId = room;
    const roomState = getRoom(roomId);

    user = createUser(name || `User-${Math.floor(Math.random() * 9000 + 1000)}`);
    addUser(roomState, user);

    socket.join(roomId);
    socket.emit("init", {
      userId: user.id,
      room: roomId,
      users: listUsers(roomState),
      history: roomState.history
    });

    socket.to(roomId).emit("user:join", { user });
  });

  socket.on("cursor", (payload) => {
    if (!user) return;
    const point = normalizePoint(payload);
    socket.to(roomId).emit("cursor", {
      userId: user.id,
      x: point.x,
      y: point.y,
      drawing: !!payload.drawing
    });
  });

  socket.on("stroke:start", (payload) => {
    if (!user) return;
    const roomState = getRoom(roomId);

    const stroke = buildStroke({
      id: payload.id,
      userId: user.id,
      color: payload.color,
      widthNorm: payload.widthNorm,
      tool: payload.tool,
      points: payload.points || [],
      seq: nextSeq(roomState)
    });

    startStroke(roomState, stroke);
    socket.to(roomId).emit("stroke:start", { stroke });
  });

  socket.on("stroke:points", (payload) => {
    if (!user) return;
    const roomState = getRoom(roomId);
    const points = (payload.points || []).map(normalizePoint);
    const stroke = appendStrokePoints(roomState, payload.id, points);
    if (!stroke) return;
    socket.to(roomId).emit("stroke:points", { id: payload.id, points });
  });

  socket.on("stroke:end", (payload) => {
    if (!user) return;
    const roomState = getRoom(roomId);
    const stroke = endStroke(roomState, payload.id);
    if (!stroke) return;
    io.to(roomId).emit("stroke:end", { id: payload.id, stroke });
  });

  socket.on("latency:ping", (payload) => {
    if (!user) return;
    socket.emit("latency:pong", { now: payload.now });
  });

  socket.on("history:undo", () => {
    if (!user) return;
    const roomState = getRoom(roomId);
    const stroke = undo(roomState);
    if (!stroke) return;
    io.to(roomId).emit("history", { history: roomState.history });
  });

  socket.on("history:redo", () => {
    if (!user) return;
    const roomState = getRoom(roomId);
    const stroke = redo(roomState);
    if (!stroke) return;
    io.to(roomId).emit("history", { history: roomState.history });
  });

  socket.on("history:clear", () => {
    if (!user) return;
    const roomState = getRoom(roomId);
    for (const strokeId of roomState.inProgress.keys()) {
      io.to(roomId).emit("stroke:cancel", { id: strokeId });
    }
    clearAll(roomState);
    io.to(roomId).emit("history", { history: roomState.history });
  });

  socket.on("disconnect", () => {
    if (!user) return;
    const roomState = getRoom(roomId);
    removeUser(roomState, user.id);
    for (const [strokeId, stroke] of roomState.inProgress.entries()) {
      if (stroke.userId === user.id) {
        cancelStroke(roomState, strokeId);
        socket.to(roomId).emit("stroke:cancel", { id: strokeId });
      }
    }
    socket.to(roomId).emit("user:leave", { userId: user.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
