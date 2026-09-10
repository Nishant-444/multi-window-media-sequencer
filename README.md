# MediaPulse — Multi-Window Media Sequencer with Synchronized Playback

[![Go Build](https://img.shields.io/badge/Go_Build-Passing-brightgreen?style=for-the-badge&logo=go)](https://golang.org)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-blue?style=for-the-badge&logo=docker)](https://hub.docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)
[![Database](https://img.shields.io/badge/SQLite-Pure_Go-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://modernc.org/sqlite)
[![Frontend](https://img.shields.io/badge/React_18-Vite_%26_Tailwind-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

[![Frontend — Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://multi-window-media-sequencer.vercel.app/)
[![Backend — Railway](https://img.shields.io/badge/Backend-Railway-6366f1?style=for-the-badge&logo=railway&logoColor=white)](https://multi-window-media-sequencer-production.up.railway.app/api/health)

**Version:** 1.0.0
**Backend:** Golang 1.22 (Standard Library `net/http` — zero web frameworks)
**Frontend:** React 18, Vite, Tailwind CSS
**Database:** Embedded SQLite 3 (`modernc.org/sqlite`, CGO-free)
**Target Runtime:** Linux / macOS / Windows / Docker

**Live Frontend:** https://multi-window-media-sequencer.vercel.app/  
**Live Backend API:** https://multi-window-media-sequencer-production.up.railway.app

---

## 1. Executive Summary

**MediaPulse** is a production-grade, full-stack media sequencing and digital signage engine built to satisfy all requirements of the **EVA Bharat Backend Development Intern Assignment 2**.

The system enables multiple display viewports to independently play media streams (video, image, or intentional blank states) within an autonomous **5-hour operational cycle**. Concurrently, the service provides an instant, thread-safe **Synchronized Playback Override** that interrupts all active displays to broadcast a single prioritized asset simultaneously — then seamlessly restores individual timelines when the override window closes.

---

## 2. System Architecture

```
                              [ Client Browsers / Display Viewports ]
                                           │              ▲
                                HTTP (REST)│              │ WebSocket (ws://:8080/ws)
                                           ▼              │
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Golang Backend Service (net/http.ServeMux)                                         │
│                                                                                    │
│   ├── CORS Middleware (EnableCORS wrapper)                                         │
│   │                                                                                │
│   ├── REST Handlers ──────────────────────────────────────┐                        │
│   │   ├── GET  /api/health                                │                        │
│   │   ├── GET  /api/windows                               │                        │
│   │   ├── POST /api/windows                               │                        │
│   │   ├── POST /api/windows/{id}/media                    │                        │
│   │   ├── DELETE /api/media/{id}                          ▼                        │
│   │   ├── GET  /api/sync/status             ┌─────────────────────────────┐        │
│   │   ├── POST /api/sync                    │      WebSocket Hub          │        │
│   │   └── POST /api/sync/stop               │                             │        │
│   │                                         │  - Event loop (select)      │        │
│   ├── SyncService (Business Logic)          │  - Non-blocking fan-out     │        │
│   │   ├── sync.Mutex (state guard)          │  - Client registry          │        │
│   │   ├── Goroutine timer (auto-expiry)     └─────────────────────────────┘        │
│   │   └── 5-Hour Cycle Calculator                        ▲                         │
│   │                                                      │                         │
│   └── Repository (Data Access Layer) ────────────────────┘                         │
│         │                                                                           │
│         ▼                                                                           │
│   [ SQLite 3 — modernc.org/sqlite (pure Go, CGO-free) ]                            │
│     - windows table                                                                 │
│     - media_items table (indexed by window_id, position)                            │
│     - sync_state table (singleton — persists override across restarts)              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Engineering & Concurrency Invariants

### 3.1 Framework Restraint
- Backend uses **strictly standard library `net/http`** — no Gin, Fiber, or Echo.
- Go 1.22 `ServeMux` handles method matching (`GET`, `POST`, `DELETE`) and path wildcards (`{id}`) natively.

### 3.2 5-Hour Continuous Timeline Engine
Each display viewport treats its sequence as an 18,000-second cycle:

$$\text{cycleElapsed} = (\text{now} - \text{serviceStart}) \bmod 18000$$
$$\text{playlistOffset} = \text{cycleElapsed} \bmod \sum \text{itemDurations}$$

The playlist wraps continuously. A `blank` state appears **only** when explicitly configured as a playlist item — the engine never silently defaults to blank.

### 3.3 State Serialization & Race Condition Prevention
- `syncState` is guarded by `sync.Mutex` — all reads and writes acquire the lock.
- SQLite is constrained to `SetMaxOpenConns(1)` to prevent `SQLITE_BUSY` contention from concurrent HTTP goroutines.
- Timer cancellation uses `close(chan struct{})` — Go's idiomatic one-to-many broadcast.

### 3.4 WebSocket Fan-Out Hub
- Hub runs on an isolated background goroutine using a `select` event loop.
- Slow or unresponsive clients are evicted via non-blocking `select/default` to prevent head-of-line blocking.
- Ping/pong keepalives detect ghost connections within 60 seconds.

### 3.5 Persistence Across Restarts
- Active sync override timestamps are persisted to SQLite before the goroutine timer arms.
- On startup, `NewSyncService` loads the stored state and re-arms the countdown timer for any remaining duration.

---

## 4. API Specification

### 4.1 `GET /api/health`
Server liveness probe.
```json
{
  "service": "multi-window-media-sequencer",
  "status": "healthy",
  "timestamp": "2026-09-11T00:20:00Z"
}
```

---

### 4.2 Displays & Playlists

#### `GET /api/windows`
Returns all display viewports with ordered playlists and computed timeline coordinates.
```json
[
  {
    "id": "win-1",
    "name": "Window 1 - Main Lobby Display",
    "created_at": "2026-09-11T00:20:00Z",
    "media_items": [
      {
        "id": "med-101",
        "window_id": "win-1",
        "title": "Nature Wildlife Showcase",
        "type": "video",
        "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        "duration": 15,
        "position": 0,
        "created_at": "2026-09-11T00:20:00Z"
      }
    ],
    "timeline": {
      "total_playlist_duration": 40,
      "cycle_elapsed_seconds": 120,
      "playlist_offset_seconds": 0,
      "current_item_index": 0,
      "current_item": {
        "id": "med-101",
        "title": "Nature Wildlife Showcase",
        "type": "video",
        "duration": 15
      },
      "item_elapsed_seconds": 0,
      "item_remaining_seconds": 15
    }
  }
]
```

#### `POST /api/windows`
Registers a new display window.
- **Body:** `{ "name": "Window 4 - Outdoor Billboard" }`
- **Response:** `201 Created` with the created window object.

#### `POST /api/windows/{id}/media`
Appends a media item to the end of the target window's playlist.
- **Body:**
  ```json
  {
    "title": "Retail Summer Promo",
    "type": "image",
    "url": "https://images.unsplash.com/photo-1513694203232-719a280e022f",
    "duration": 10
  }
  ```
- **Response:** `201 Created` with the created media item object.
- **Supported types:** `video`, `image`, `blank` (URL can be empty for `blank`).

#### `DELETE /api/media/{id}`
Removes a media asset and compacts subsequent sequence positions atomically.
- **Response:** `200 OK`

---

### 4.3 Synchronized Override Control

#### `GET /api/sync/status`
Returns the current override state with live remaining-time calculation.
```json
{
  "is_active": true,
  "media_item": {
    "id": "med-101",
    "title": "Nature Wildlife Showcase",
    "type": "video",
    "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "duration": 15
  },
  "duration_seconds": 15,
  "remaining_seconds": 12
}
```

#### `POST /api/sync`
Initiates a synchronized override session across all connected displays.
- **Body:**
  ```json
  {
    "media_item_id": "med-101",
    "duration_seconds": 15
  }
  ```
- **Response:** `200 OK` with the activated `SyncState` object.
- If `duration_seconds` is omitted or ≤ 0, defaults to **15 seconds**.

#### `POST /api/sync/stop`
Terminates an active override early and immediately restores all displays to their individual timelines.
- **Response:** `200 OK`

---

### 4.4 WebSocket Channel (`ws://localhost:8080/ws`)

Connect to receive real-time events. All messages follow the format `{ "type": "...", "payload": { ... } }`.

| Event Type | Payload | Trigger |
|:---|:---|:---|
| `SYNC_START` | `SyncState` object | `POST /api/sync` called |
| `SYNC_END` | `{ "message": "..." }` | Override expires or `POST /api/sync/stop` called |
| `PLAYLIST_UPDATED` | `{ "window_id": "...", "media_items": [...] }` | Media item added or deleted |
| `WINDOW_ADDED` | `Window` object | `POST /api/windows` called |

---

## 5. Project Structure

```
multi-window-media-sequencer/
├── GOLANG_EXPLAINER.md              ← Go concepts explained for web engineers
├── README.md                        ← This file
├── Dockerfile                       ← Root-context multi-stage Docker build
├── docker-compose.yml               ← Orchestrates backend + frontend containers
├── postman_collection.json          ← Import into Postman to test all endpoints
│
├── backend/
│   ├── cmd/server/main.go           ← Entry point & dependency injection
│   ├── internal/
│   │   ├── models/models.go         ← Data types (Window, MediaItem, SyncState)
│   │   ├── database/
│   │   │   ├── db.go                ← SQLite connection pool & DDL schema
│   │   │   └── seed.go              ← Idempotent demo data
│   │   ├── repository/repository.go ← All SQL queries
│   │   ├── service/
│   │   │   ├── sync_service.go      ← Sync override logic & 5-hour cycle engine
│   │   │   └── sync_service_test.go ← Unit tests
│   │   ├── websocket/hub.go         ← Client registry & message fan-out
│   │   └── handlers/handlers.go     ← HTTP endpoint implementations
│   ├── go.mod / go.sum
│   └── vendor/                      ← Vendored dependencies (reproducible builds)
│
└── frontend/
    ├── src/
    │   ├── App.jsx                  ← Main application component
    │   ├── components/              ← MediaWindow, SyncControls, etc.
    │   └── services/                ← REST API client & WebSocket hook
    └── ...
```

---

## 6. Live Deployment

The application is deployed and publicly accessible:

| Service | URL |
|:---|:---|
| **Frontend** (Vercel) | https://multi-window-media-sequencer.vercel.app/ |
| **Backend API** (Railway) | https://multi-window-media-sequencer-production.up.railway.app |
| **API Health Check** | https://multi-window-media-sequencer-production.up.railway.app/api/health |
| **WebSocket** | `wss://multi-window-media-sequencer-production.up.railway.app/ws` |

---

## 7. Local Setup & Execution

### Prerequisites
- **Go:** 1.22+
- **Node.js:** 18+ with `npm`

### Step 1 — Run the Backend
```bash
cd backend
go mod tidy          # download dependencies
go test -v ./...     # run unit tests (should all pass)
go run ./cmd/server/main.go
```
- HTTP API available at `http://localhost:8080`
- WebSocket available at `ws://localhost:8080/ws`
- Health check: `curl http://localhost:8080/api/health`

### Step 2 — Run the Frontend
Open a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Navigate to **`http://localhost:5173`**.

> **Environment Variables** (backend):
> | Variable | Default | Description |
> |:---|:---|:---|
> | `PORT` | `8080` | HTTP listener port |
> | `DB_PATH` | `media_sequencer.db` | SQLite file path |

---

## 8. Containerized Deployment (Docker Compose)

Production-grade multi-stage builds:
- **Backend:** Statically-linked CGO-free binary on Alpine Linux
- **Frontend:** Static assets via Nginx reverse-proxy

```bash
# Build and start both services
docker compose up --build -d

# View logs
docker compose logs -f
```

| Service | URL |
|:---|:---|
| Frontend UI | `http://localhost:3000` |
| Backend API | `http://localhost:8080` |
| Health Check | `http://localhost:8080/api/health` |

---

## 9. Automated Test Suite

Unit tests cover the 5-hour cycle mathematical engine and boundary conditions:

```bash
cd backend
go test -v ./...
```

Expected output:
```
=== RUN   TestCalculate5HourCyclePosition
--- PASS: TestCalculate5HourCyclePosition (0.00s)
=== RUN   Test5HourCycleBoundaryWrap
--- PASS: Test5HourCycleBoundaryWrap (0.00s)
=== RUN   TestEmptyPlaylistHandling
--- PASS: TestEmptyPlaylistHandling (0.00s)
PASS
ok  	multi-window-media-sequencer/backend/internal/service	0.003s
```

**Test coverage:**
| Test | What it validates |
|:---|:---|
| `TestCalculate5HourCyclePosition` | Correct item index, elapsed, and remaining seconds for a mid-playlist offset |
| `Test5HourCycleBoundaryWrap` | That 18,010 seconds wraps back to 10 seconds elapsed (cycle boundary) |
| `TestEmptyPlaylistHandling` | Safe zero-state return for windows with no media items |

---

## 10. Testing with Postman

Import `postman_collection.json` into Postman. The collection includes pre-configured requests for all 8 endpoints with example bodies. Set the `baseUrl` collection variable to:
- **Local:** `http://localhost:8080`
- **Docker:** `http://localhost:8080`
