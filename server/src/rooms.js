const { randomUUID } = require("crypto");

const COLOR_POOL = [
  "#1D4ED8",
  "#059669",
  "#B45309",
  "#DC2626",
  "#0F766E",
  "#6D28D9",
  "#B91C1C",
  "#0E7490"
];

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),
      history: [],
      undone: [],
      inProgress: new Map(),
      seq: 0
    });
  }
  return rooms.get(roomId);
}

function createUser(name) {
  const id = randomUUID();
  const color = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
  return { id, name, color };
}

function addUser(room, user) {
  room.users.set(user.id, user);
}

function removeUser(room, userId) {
  room.users.delete(userId);
}

function listUsers(room) {
  return Array.from(room.users.values());
}

function startStroke(room, stroke) {
  room.inProgress.set(stroke.id, stroke);
}

function appendStrokePoints(room, strokeId, points) {
  const stroke = room.inProgress.get(strokeId);
  if (!stroke) return null;
  stroke.points.push(...points);
  return stroke;
}

function endStroke(room, strokeId) {
  const stroke = room.inProgress.get(strokeId);
  if (!stroke) return null;
  room.inProgress.delete(strokeId);
  room.history.push(stroke);
  room.undone = [];
  return stroke;
}

function cancelStroke(room, strokeId) {
  room.inProgress.delete(strokeId);
}

function undo(room) {
  const stroke = room.history.pop();
  if (!stroke) return null;
  room.undone.push(stroke);
  return stroke;
}

function redo(room) {
  const stroke = room.undone.pop();
  if (!stroke) return null;
  room.history.push(stroke);
  return stroke;
}

function clearAll(room) {
  room.history = [];
  room.undone = [];
  room.inProgress = new Map();
}

function nextSeq(room) {
  room.seq += 1;
  return room.seq;
}

module.exports = {
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
};
