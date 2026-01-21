# Architecture

## Data Flow Diagram

```
Pointer events
   |
   v
Client (CanvasManager)
   |  stroke:start / stroke:points / stroke:end
   v
Socket.io Server (room state)
   |  broadcast stroke updates
   v
All Clients
   |  update in-progress strokes + commit history
   v
Canvas redraw (base + overlay layers)
```

## WebSocket Protocol

Client -> Server
- `join` { room, name }
- `cursor` { x, y, drawing }
- `stroke:start` { id, color, widthNorm, tool, points }
- `stroke:points` { id, points[] }
- `stroke:end` { id }
- `history:undo`
- `history:redo`
- `history:clear`
- `latency:ping` { now }

Server -> Client
- `init` { userId, room, users[], history[] }
- `user:join` { user }
- `user:leave` { userId }
- `cursor` { userId, x, y, drawing }
- `stroke:start` { stroke }
- `stroke:points` { id, points[] }
- `stroke:end` { id, stroke }
- `stroke:cancel` { id }
- `history` { history[] }
- `latency:pong` { now }

## Undo / Redo Strategy

- Server owns the source-of-truth history per room.
- Each completed stroke is appended to `history` and clears the `undone` stack.
- Global undo pops the last stroke from `history` and pushes it to `undone`.
- Global redo pops from `undone` and appends to `history`.
- Server broadcasts the full `history` after undo/redo; clients redraw the base layer.
- Clear all resets `history` and `undone`, cancels in-progress strokes, and broadcasts empty history.

## Performance Decisions

- Points are normalized to [0..1] so resizing keeps strokes aligned.
- Points are batched and sent roughly every 16ms to reduce network chatter.
- Two-layer canvas: base layer for committed strokes, overlay for in-progress strokes.
- Overlay re-renders via `requestAnimationFrame` only when new data arrives.

## Conflict Resolution

- Server assigns an incremental sequence to each stroke on `stroke:start`.
- Overlapping strokes are rendered in the order they are completed in `history`.
- For in-progress strokes, clients use the server sequence to draw in a consistent order.
