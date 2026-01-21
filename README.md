# Real-Time Collaborative Drawing Canvas

A simple multi-user drawing app with global undo/redo, live cursors, and stroke streaming using Socket.io and the Canvas API.

## Setup

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Project structure

```
collaborative-canvas/
  client/
    public/              # Static frontend files
      index.html
      style.css
      canvas.js
      websocket.js
      main.js
  server/
    src/                 # Backend logic
      server.js
      rooms.js
      drawing-state.js
  package.json
  README.md
  ARCHITECTURE.md
```

### Test with multiple users

- Open multiple tabs/windows.
- Optional rooms: `http://localhost:3000/?room=team-a`
- Each room is isolated in-memory on the server.

## Known limitations / bugs

- History is in-memory only; restarting the server clears the canvas.
- Undo/redo is global and replays the full history, which can be heavy with very large sessions.
- Stroke width scales with canvas width; resizing the window changes how thick older strokes appear.
- Clear All wipes the room for everyone immediately (no per-user opt-out).

## Time spent

~8 hours.
