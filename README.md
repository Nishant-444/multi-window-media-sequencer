# MediaPulse - Multi-Window Media Sequencer with Synchronized Playback

[![Go Test & Build](https://img.shields.io/badge/Go_Build-Passing-brightgreen?style=for-the-badge&logo=go)](https://golang.org)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-blue?style=for-the-badge&logo=docker)](https://hub.docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)
[![Database](https://img.shields.io/badge/SQLite-Pure_Go-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://modernc.org/sqlite)
[![Frontend](https://img.shields.io/badge/React_18-Vite_&_Tailwind-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

**Version:** 1.0.0  
**Target Runtime:** Linux / macOS / Windows / Docker  
**Backend:** Golang (Standard Library `net/http`)  
**Frontend:** React 18, Vite, Tailwind CSS  
**Database:** Embedded SQLite 3 (`modernc.org/sqlite`, CGO-Free)  

---

## 1. Executive Summary

**MediaPulse** is a high-availability, full-stack media sequencing and digital signage engine engineered to satisfy all core requirements of the **EVA Bharat Backend Development Intern Assignment 2**.

The system enables multiple physical or virtual display viewports to continuously play distinct media streams (video, image, or ambient fallback states) within an autonomous **5-hour operational cycle**. In tandem, the service provides an instant, thread-safe **Synchronized Playback Override** that interrupts all active displays to broadcast a single prioritized media asset simultaneously, seamlessly resuming individual timelines when the override window closes.

---

## 2. System Architecture

```
                                [ Client Browsers / Display Displays ]
                                             │              ▲
                                  HTTP (REST)│              │ WebSocket (ws://:8080/ws)
                                             ▼              │
┌───────────────────────────────────────────────────────────┼────────────────────────────────────────┐
│ Golang Backend Service (net/http.ServeMux)                │                                        │
│                                                           │                                        │
│   ├── CORS Middleware                                     │                                        │
│   │                                                       │                                        │
│   ├── REST Handlers ──────────────────────────────────────┼─────────────┐                          │
│   │   ├── GET  /api/health                                │             │                          │
│   │   ├── GET  /api/windows                               │             │                          │
│   │   ├── POST /api/windows                               │             │                          │
│   │   ├── POST /api/windows/{id}/media                    │             │                          │
│   │   ├── DEL  /api/media/{id}                            │             ▼                          │
│   │   ├── GET  /api/sync/status                     ┌─────┴─────────────────────────┐              │
│   │   ├── POST /api/sync                            │      WebSocket Hub            │              │
│   │   └── POST /api/sync/stop                       │                               │              │
│   │                                                 │  - Event Multiplexer (select) │              │
│   ├── Synchronized Override Engine (SyncService)    │  - Non-blocking Fan-Out Queue │              │
│   │   ├── sync.Mutex (State Serialization)          │  - Client Lifecycle Registry  │              │
│   │   ├── Goroutine Timer (time.NewTimer)           └───────────────────────────────┘              │
│   │   └── Modular Cycle Engine (5-Hour Loop)                      ▲                                │
│   │                                                               │                                │
│   └── Data Access Layer (Repository) ─────────────────────────────┘                                │
│         │                                                                                          │
│         ▼                                                                                          │
│   [ SQLite 3 Database (modernc.org/sqlite) ]                                                       │
│     - Windows Table                                                                                │
│     - Media Items Table (Indexed by window_id, position)                                           │
│     - Singleton Sync State Table                                                                   │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Engineering & Concurrency Invariants

### 3.1 Framework Restraint & Routing Purity
To maximize performance, reduce memory overhead, and ensure absolute transparency during code review:
- The backend uses **strictly standard library `net/http`** routing via Go 1.22+ `http.ServeMux`.
- Zero third-party web frameworks (no Gin, Fiber, or Echo).
- Path wildcards (`/api/windows/{id}/media`) and HTTP verb matching (`POST`, `DELETE`, `GET`) are handled natively.

### 3.2 5-Hour Continuous Timeline Engine
The specification mandates that each display viewport treats its sequence as a 5-hour cycle ($18,000$ seconds):
- Instead of terminating or dropping into blank screens when a playlist completes, the sequence wraps smoothly back to index `0` continuously.
- **Formula:**
  $$\text{CycleElapsed} = (\text{CurrentTime} - \text{CycleStartTime}) \pmod{18000}$$
  $$\text{PlaylistOffset} = \text{CycleElapsed} \pmod{\sum \text{ItemDuration}}$$
- A `blank` state is rendered **only** when explicitly configured as an intentional playlist item; the remainder of the timeline never defaults to blank playback.

### 3.3 State Management & Race Condition Elimination
- Shared in-memory override state (`models.SyncState`) is guarded by a mutual exclusion primitive (`sync.Mutex`).
- Critical read/write sections acquire `mu.Lock()` and leverage `defer mu.Unlock()` to guarantee lock release across error paths or runtime panics.
- SQLite writes are constrained to a serialized pool (`SetMaxOpenConns(1)`) to avoid `SQLITE_BUSY` locking friction across concurrent HTTP goroutines.

### 3.4 WebSocket Fan-Out Hub
- The hub executes its event loop on an isolated background goroutine.
- Inbound client frames and outgoing broadcast events are handled across buffered channels (`chan []byte`).
- Slow, saturated, or disconnected clients are evicted via non-blocking channel selects (`default` fallthrough) to prevent head-of-line blocking for responsive displays.

---

## 4. API Specification

### 4.1 Displays & Playlists

#### `GET /api/windows`
Returns all display viewports with ordered playlist items and computed timeline coordinates.
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
      "item_elapsed_seconds": 0,
      "item_remaining_seconds": 15
    }
  }
]
```

#### `POST /api/windows`
Registers a new display window entity.
- **Request Body:**
  ```json
  { "name": "Window 4 - Outdoor Billboard" }
  ```
- **Response:** `201 Created`

#### `POST /api/windows/{id}/media`
Appends a media item to the tail of the target window playlist.
- **Request Body:**
  ```json
  {
    "title": "Retail Summer Promo",
    "type": "image",
    "url": "https://images.unsplash.com/photo-1513694203232-719a280e022f",
    "duration": 10
  }
  ```
- **Response:** `201 Created`

#### `DELETE /api/media/{id}`
Deletes an asset and compacts subsequent sequence positions inside an atomic transaction.
- **Response:** `200 OK`

---

### 4.2 Synchronized Override Control

#### `GET /api/sync/status`
Returns active override status and duration metrics.
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
Initiates an override session across all displays.
- **Request Body:**
  ```json
  {
    "media_item_id": "med-101",
    "duration_seconds": 15
  }
  ```
- **Response:** `200 OK`

#### `POST /api/sync/stop`
Terminates an active override early and restores default sequences.
- **Response:** `200 OK`

---

### 4.3 WebSocket Channel (`ws://localhost:8080/ws`)

| Event Type | Payload Format | Description |
| :--- | :--- | :--- |
| `SYNC_START` | `models.SyncState` | Dispatched immediately when an override is triggered. Displays switch to target media. |
| `SYNC_END` | `{"message": "..."}` | Dispatched when override duration expires or is cancelled. Displays resume normal playlists. |
| `PLAYLIST_UPDATED` | `{"window_id": "...", "media_items": [...]}` | Dispatched on asset creation or deletion. Displays reflect live playlist modifications. |
| `WINDOW_ADDED` | `models.Window` | Dispatched when a new screen is registered. |

---

## 5. Local Setup & Execution

### Prerequisites
- **Golang**: 1.22+
- **Node.js**: 18+ and `npm`

### 1. Run Backend Service
```bash
cd backend
go mod tidy
go test -v ./...
go run ./cmd/server/main.go
```
The HTTP listener binds to `:8080` and the WebSocket channel is accessible at `ws://:8080/ws`.

### 2. Run Frontend Application
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173`.

---

## 6. Containerized Deployment (Docker Compose)

The repository provides production-grade multi-stage Docker builds:
- **Backend:** Compiles a statically linked, CGO-free binary running on minimal Alpine Linux.
- **Frontend:** Compiles static assets served via an Nginx reverse-proxy image.

### 1-Click Launch:
```bash
docker compose up --build -d
```
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:8080`

---

## 7. Automated Test Suite

Unit tests validate the mathematical sequence engine and boundary transitions:
```bash
cd backend
go test -v ./...
```
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
