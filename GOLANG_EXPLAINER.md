# Golang Architectural & Technical Explainer
## *For Web Engineers Transitioning to Go — Interview-Ready Reference*

> **Project:** Multi-Window Media Sequencer with Sync Playback
> **Repository:** `multi-window-media-sequencer/`
> **Backend Language:** Go 1.22 (Standard Library only)

---

## Table of Contents

1. [Why Go? (Compared to Node.js)](#1-why-go)
2. [Project Package Layout](#2-project-package-layout)
3. [Core Go Concepts Used in This Project](#3-core-go-concepts)
   - [Structs & Methods](#31-structs--methods)
   - [Interfaces](#32-interfaces)
   - [Goroutines](#33-goroutines)
   - [Channels](#34-channels)
   - [sync.Mutex (Mutual Exclusion)](#35-syncmutex)
   - [defer](#36-defer)
   - [Error Handling](#37-error-handling)
4. [Architecture Deep-Dive by Package](#4-architecture-deep-dive)
   - [cmd/server/main.go](#41-cmdservermain-go)
   - [internal/models](#42-internalmodels)
   - [internal/database](#43-internaldatabase)
   - [internal/repository](#44-internalrepository)
   - [internal/service](#45-internalservice)
   - [internal/websocket](#46-internalwebsocket)
   - [internal/handlers](#47-internalhandlers)
5. [The 5-Hour Cycle Engine Explained](#5-the-5-hour-cycle-engine)
6. [Concurrency Safety Guarantees](#6-concurrency-safety-guarantees)
7. [Interview Q&A Reference](#7-interview-qa)

---

## 1. Why Go?

| Concern | Node.js (JavaScript) | Go |
|:---|:---|:---|
| Concurrency model | Single-threaded event loop + async/await | True OS threads via goroutines |
| Performance | Good for I/O-bound | Excellent for CPU + I/O-bound |
| Deployment | Needs Node runtime | Single statically-linked binary |
| Type safety | Optional (TypeScript) | Built-in, strict at compile time |
| Memory management | V8 GC | Go runtime GC (lower latency) |
| Standard library | Minimal HTTP (needs Express) | Full production HTTP server included |

**Why it matters for this project:** The sync override must fire with sub-millisecond precision across all connected WebSocket clients simultaneously. A goroutine-based timer fan-out achieves this reliably without callback hell.

---

## 2. Project Package Layout

```
multi-window-media-sequencer/
├── GOLANG_EXPLAINER.md          ← This file
├── README.md                    ← Setup & API reference
├── Dockerfile                   ← Root-context multi-stage build
├── docker-compose.yml           ← Orchestrates backend + frontend
├── postman_collection.json      ← Importable API test collection
│
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go          ← Entry point: wires all components together
│   ├── internal/
│   │   ├── models/
│   │   │   └── models.go        ← Data types: Window, MediaItem, SyncState, WSMessage
│   │   ├── database/
│   │   │   ├── db.go            ← SQLite connection pool & schema DDL
│   │   │   └── seed.go          ← Idempotent demo data population
│   │   ├── repository/
│   │   │   └── repository.go    ← All SQL queries (the data access layer)
│   │   ├── service/
│   │   │   ├── sync_service.go  ← Business logic: sync override & timeline engine
│   │   │   └── sync_service_test.go ← Unit tests for the 5-hour cycle math
│   │   ├── websocket/
│   │   │   └── hub.go           ← WebSocket hub: client registry & fan-out
│   │   └── handlers/
│   │       └── handlers.go      ← HTTP endpoint implementations
│   ├── go.mod                   ← Module definition + dependency declarations
│   ├── go.sum                   ← Cryptographic hash lock for dependencies
│   └── vendor/                  ← Vendored dependencies (reproducible builds)
│
└── frontend/
    ├── src/
    │   ├── App.jsx              ← Main React component
    │   ├── components/          ← MediaWindow, SyncControls, etc.
    │   └── services/            ← API client, WebSocket hook
    └── ...
```

> **Why `internal/`?** In Go, any package placed inside an `internal/` directory can only be imported by code within the same module. This enforces encapsulation at the language level — no external package can accidentally import your internal business logic.

---

## 3. Core Go Concepts

### 3.1 Structs & Methods

Go has no classes. Instead, you define **structs** (data shapes) and attach **methods** to them.

```go
// models/models.go

// MediaItem is a struct — think of it like a TypeScript interface that also holds data.
type MediaItem struct {
    ID       string    `json:"id"`        // backtick annotations are "struct tags" — used by json.Marshal
    WindowID string    `json:"window_id"`
    Title    string    `json:"title"`
    Type     string    `json:"type"`
    URL      string    `json:"url"`
    Duration int       `json:"duration"`
    Position int       `json:"position"`
    CreatedAt time.Time `json:"created_at"`
}
```

**Methods** are functions with a *receiver* — the struct they "belong to":

```go
// repository/repository.go

type Repository struct {
    db *sql.DB  // unexported field (lowercase) — private to this package
}

// (r *Repository) is the receiver — like 'this' in JavaScript
func (r *Repository) GetAllWindows() ([]models.Window, error) {
    // ...
}
```

---

### 3.2 Interfaces

Go interfaces are **implicit** — a type satisfies an interface if it has the required methods. No `implements` keyword needed.

```go
// Hypothetical example illustrating the pattern used in this project:
type MediaRepository interface {
    GetAllWindows() ([]models.Window, error)
    GetWindowByID(id string) (*models.Window, error)
}

// Repository automatically satisfies MediaRepository because it has both methods.
```

This is why you can easily swap a real database repository for a mock in tests.

---

### 3.3 Goroutines

A goroutine is a **lightweight thread** managed by the Go runtime. Unlike OS threads (expensive, ~1MB stack), goroutines start with ~2KB and are multiplexed across CPU cores automatically.

```go
// main.go — Three goroutines launched at startup:

// 1. The WebSocket hub event loop
go hub.Run()

// 2. The HTTP server listener
go func() {
    server.ListenAndServe()
}()

// 3. The sync countdown timer (launched inside TriggerSync)
go func(duration time.Duration, cancel <-chan struct{}) {
    timer := time.NewTimer(duration)
    select {
    case <-timer.C:
        s.StopSyncInternal()  // fired naturally
    case <-cancel:
        return  // aborted early
    }
}(...)
```

**Interview insight:** "We use goroutines here because each one costs almost nothing. The HTTP server handles hundreds of concurrent requests — each in its own goroutine — without blocking anything else."

---

### 3.4 Channels

Channels are Go's **typed communication pipes** between goroutines. They prevent the need for shared mutable state.

```go
// websocket/hub.go

type Hub struct {
    clients    map[*Client]bool
    broadcast  chan []byte       // buffered: holds up to 256 messages
    register   chan *Client      // unbuffered: blocks until receiver is ready
    unregister chan *Client
    mu         sync.Mutex
}
```

**How the broadcast works:**

```
SyncService.TriggerSync()
        │
        │  hub.Broadcast("SYNC_START", state)
        ▼
hub.broadcast channel ──────► Hub.Run() goroutine
                                        │
                          for each client:
                                │
                          client.send channel ──► writePump() goroutine ──► WebSocket wire
```

**Why buffered channels?** `make(chan []byte, 256)` means the sender (e.g., `TriggerSync`) doesn't block even if the hub's event loop is briefly busy — it queues up to 256 messages.

**Non-blocking send for slow clients:**

```go
select {
case client.send <- message:
    // client received it ✓
default:
    // client's channel is full — evict them to prevent blocking fast clients
    close(client.send)
    delete(h.clients, client)
}
```

---

### 3.5 sync.Mutex

A **Mutex** (Mutual Exclusion lock) ensures that only one goroutine can access a shared resource at a time. This prevents *race conditions* — bugs where two concurrent operations corrupt data.

```go
// service/sync_service.go

type SyncService struct {
    mu        sync.Mutex    // guards syncState against concurrent reads/writes
    syncState models.SyncState
    ...
}

func (s *SyncService) TriggerSync(mediaItemID string, durationSec int) (*models.SyncState, error) {
    // ...
    s.mu.Lock()           // acquire the lock — other goroutines will BLOCK here
    defer s.mu.Unlock()   // release the lock when this function returns (guaranteed)

    // CRITICAL SECTION: only one goroutine can be here at a time
    s.syncState = models.SyncState{ IsActive: true, ... }
    // ...
}
```

**Interview insight:** "Without the mutex, if two HTTP clients call `POST /api/sync` simultaneously, both goroutines would write to `syncState` at the same time, producing undefined garbage data. The mutex serializes access."

---

### 3.6 defer

`defer` schedules a function call to run **when the surrounding function returns**, regardless of how it returns (normal return, early return, or panic).

```go
func (r *Repository) DeleteMediaItem(id string) error {
    tx, err := r.db.Begin()
    defer tx.Rollback()  // always called — harmless if Commit() already succeeded

    // ... do work ...

    return tx.Commit()  // Rollback() fires after this, but is a no-op post-commit
}
```

```go
rows, err := r.db.Query(...)
defer rows.Close()  // rows is always closed even if we return early on error
```

**Three canonical uses of `defer` in this codebase:**
1. `defer mu.Unlock()` — always release locks
2. `defer rows.Close()` — always close SQL result sets
3. `defer tx.Rollback()` — always attempt cleanup on transactions

---

### 3.7 Error Handling

Go has no exceptions. Functions return errors as explicit last return values. This forces callers to handle failures.

```go
// db.go
db, err := sql.Open("sqlite", dbPath)
if err != nil {
    return nil, fmt.Errorf("failed to initialize sqlite driver: %w", err)
    //                                                           ^^^ %w wraps the error
    //                                                               preserving the stack
}
```

**Error wrapping with `%w`:** Allows callers to inspect the original error with `errors.Is()` or `errors.As()` while adding context at each layer.

```
main.go:     "Database initialization failure: ..."
  └─ db.go:  "schema initialization failed: ..."
       └─ db.go: "executing schema ddl: ..."
            └─ (original sqlite driver error)
```

**Interview insight:** "In Node.js, you'd use try/catch. In Go, every function that can fail returns `(result, error)`. This makes error handling explicit and impossible to accidentally ignore — the compiler warns you if you don't use a return value."

---

## 4. Architecture Deep-Dive

### 4.1 `cmd/server/main.go`

The entry point performs **dependency injection** — it creates concrete instances and wires them together:

```
InitDB() ──► SeedDatabase()
                │
                ▼
         NewRepository(db)
                │
         NewHub() ──► go hub.Run()
                │
         NewSyncService(repo, hub)
                │
         NewHandler(repo, syncSvc, hub)
                │
         http.NewServeMux() ── registers 8 routes
                │
         http.Server{} ── starts listening
```

This pattern is called **manual dependency injection** — no framework needed. Each component only knows about the abstraction it needs, not how it's constructed.

**Graceful shutdown:** The server listens for OS `SIGINT`/`SIGTERM` signals and calls `server.Shutdown(ctx)` with a 5-second timeout, allowing in-flight requests to complete before exit.

---

### 4.2 `internal/models`

Pure data types — no logic, no database calls. This is Go's equivalent of a TypeScript types file.

| Type | Purpose |
|:---|:---|
| `MediaItem` | An asset in a window's playlist (video/image/blank) |
| `Window` | A display viewport with an ordered `[]MediaItem` playlist |
| `SyncState` | Global override state (active media, timer timestamps) |
| `WSMessage` | The wire format for all WebSocket frames `{type, payload}` |

---

### 4.3 `internal/database`

**`db.go`** — Initializes the connection pool and applies DDL schema:
- `SetMaxOpenConns(1)`: SQLite uses file-level locking. One writer at a time prevents `SQLITE_BUSY` errors under concurrent HTTP load.
- `PRAGMA foreign_keys = ON`: Enables referential integrity (deleting a Window cascades to its MediaItems).
- `INSERT OR IGNORE INTO sync_state`: Creates the singleton sync state row on first run.

**`seed.go`** — Populates three demo windows if the database is empty. Uses an idempotency check (`SELECT COUNT(*) FROM windows`) so re-running the server never duplicates data.

---

### 4.4 `internal/repository`

The data access layer. All SQL lives here — handlers and services never write raw SQL.

| Method | SQL Operation |
|:---|:---|
| `GetAllWindows()` | `SELECT` all windows + N subqueries for media items |
| `GetWindowByID(id)` | `SELECT` single window by PK |
| `CreateWindow(w)` | `INSERT INTO windows` |
| `GetMediaItemsByWindowID(id)` | `SELECT` ordered by `position ASC` |
| `AddMediaItem(m)` | `SELECT MAX(position)` then `INSERT` at `maxPos+1` |
| `DeleteMediaItem(id)` | `DELETE` + `UPDATE positions` in a transaction |
| `SaveSyncState(...)` | `UPDATE sync_state WHERE id = 1` |
| `LoadSyncState()` | `SELECT` + rejoin `media_item_id → MediaItem` |

**Transaction pattern** in `DeleteMediaItem`:
```go
tx, err := r.db.Begin()
defer tx.Rollback()              // safety net

tx.Exec("DELETE ...")            // step 1
tx.Exec("UPDATE positions ...")  // step 2 — atomic with step 1

return tx.Commit()               // both succeed or both fail
```

---

### 4.5 `internal/service`

The business logic layer. Contains the two most complex components:

**`SyncService`** manages:
1. The **synchronized override** — a goroutine-timer mechanism that auto-expires overrides
2. The **5-hour cycle position calculator** — pure math function with no side effects

**Override lifecycle:**

```
TriggerSync(mediaItemID, durationSec)
    │
    ├─ Cancel any existing timerCancel channel (close() unblocks goroutine)
    ├─ Update syncState under mutex lock
    ├─ Persist to SQLite (survives server restarts)
    ├─ Launch background goroutine with time.NewTimer
    └─ Broadcast SYNC_START to all WebSocket clients

                    [durationSec seconds later...]

StopSyncInternal() called by goroutine
    │
    ├─ Update syncState under mutex lock
    ├─ Persist cleared state to SQLite
    └─ Broadcast SYNC_END to all WebSocket clients
```

**Restart recovery:** `NewSyncService()` loads the persisted state from SQLite. If the override timer would have expired during the downtime, `IsActive` is set to `false`. If time remains, it re-arms the countdown goroutine for the remaining duration.

---

### 4.6 `internal/websocket`

The **Hub** is the central event router. It runs on a single dedicated goroutine (`go hub.Run()` in `main.go`) and uses `select` to process three types of events:

```go
select {
case client := <-h.register:    // new browser connected
case client := <-h.unregister:  // browser disconnected
case message := <-h.broadcast:  // event to send to everyone
}
```

**Per-client goroutines:** For every connected browser, two goroutines are launched:
- `readPump()`: Reads incoming frames; detects disconnects; sends ping keepalives
- `writePump()`: Drains `client.send` channel to the WebSocket wire

**Ping/pong keepalive:** Every 54 seconds (`pingPeriod = pongWait * 9 / 10`), the server sends a WebSocket `PING` frame. If no `PONG` is received within 60 seconds (`pongWait`), the connection is closed. This prevents ghost connections from consuming resources.

---

### 4.7 `internal/handlers`

Thin HTTP handlers that parse requests, delegate to services/repositories, and write responses.

**CORS Middleware pattern:**
```go
// EnableCORS wraps any http.Handler — this is Go's middleware pattern
func EnableCORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        // ...
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusNoContent)
            return  // short-circuit preflight
        }
        next.ServeHTTP(w, r)  // call the wrapped handler
    })
}
```

**Route registration using Go 1.22 method+path pattern matching:**
```go
mux.HandleFunc("GET /api/windows", handler.ListWindows)
mux.HandleFunc("POST /api/windows/{id}/media", handler.AddMediaItem)
//                                 ^^^
//          {id} is a path wildcard; retrieved via r.PathValue("id")
```

---

## 5. The 5-Hour Cycle Engine

The mathematical heart of the system. Given a window's playlist and the current time:

```
cycleElapsed = (now - serviceStartTime) mod 18000   [seconds within current 5hr cycle]
playlistOffset = cycleElapsed mod totalPlaylistDuration
```

Then walk the playlist accumulating durations until the offset falls within an item's range.

**Example:**
```
Playlist: [Video A: 15s] [Image B: 10s] [Video C: 25s]
Total duration: 50s

At cycleElapsed = 3672s:
  playlistOffset = 3672 mod 50 = 22

Walk items:
  Video A: accumulated=0, range [0, 15) — 22 ≥ 15, skip
  Image B: accumulated=15, range [15, 25) — 22 is in [15, 25) ✓

Result: Playing Image B, 7s elapsed, 3s remaining
```

**Test coverage** (`sync_service_test.go`):
- `TestCalculate5HourCyclePosition`: normal mid-playlist calculation
- `Test5HourCycleBoundaryWrap`: verifies 18010s wraps back to 10s elapsed
- `TestEmptyPlaylistHandling`: ensures zero-item playlists return zero-state safely

---

## 6. Concurrency Safety Guarantees

| Shared Resource | Protection Mechanism | Location |
|:---|:---|:---|
| `SyncService.syncState` | `sync.Mutex` (mu) | `sync_service.go` |
| `Hub.clients` map | `sync.Mutex` (mu) | `hub.go` |
| SQLite writes | `SetMaxOpenConns(1)` | `db.go` |
| Channel fan-out | Non-blocking `select/default` | `hub.go Run()` |
| Timer cancellation | Closing `chan struct{}` | `sync_service.go` |

**Closing a channel to cancel:** `close(s.timerCancel)` unblocks any goroutine waiting on `<-cancelChan`. This is Go's idiomatic one-to-many cancellation broadcast — better than sending a value because it works for any number of waiting goroutines.

---

## 7. Interview Q&A

**Q: Why not use Gin or Echo for routing?**
> The assignment specifies standard library only. Additionally, Go 1.22's `net/http.ServeMux` now supports method-qualified patterns (`GET /api/windows`) and path wildcards (`{id}`), making third-party routers unnecessary for most use cases.

**Q: What happens if the server crashes during an active sync override?**
> The override start time and end time are persisted to SQLite before the goroutine timer is armed. On restart, `NewSyncService` reads the persisted state. If `endsAt` is still in the future, it re-arms the countdown timer for the remaining duration. If `endsAt` is in the past, it clears the state.

**Q: How do you prevent a slow WebSocket client from blocking a fast one?**
> Each client has a buffered `send chan []byte` (capacity 256). When broadcasting, the hub uses a non-blocking `select { case client.send <- msg: default: evict }`. If the client's buffer is full (it's too slow), it's evicted. The fast clients are unaffected.

**Q: What is a race condition and how did you avoid it here?**
> A race condition occurs when two goroutines read and write shared data simultaneously without coordination. For example, two simultaneous `POST /api/sync` requests would both try to modify `syncState`. We prevent this with `sync.Mutex` — the second goroutine blocks at `mu.Lock()` until the first releases the lock with `mu.Unlock()`.

**Q: Why `modernc.org/sqlite` instead of `mattn/go-sqlite3`?**
> `mattn/go-sqlite3` requires CGO (calling C code from Go), which requires a C compiler at build time. `modernc.org/sqlite` is a pure Go port that compiles with `CGO_ENABLED=0`, producing statically-linked binaries that run on any Linux container without a C runtime dependency.

**Q: How does the 5-hour cycle avoid resetting at server restart?**
> `cycleStartTime` is set to `time.Now()` when the service starts. Because the cycle duration (18,000s) is much longer than typical restart windows, the timeline position after restart will be a few seconds ahead — indistinguishable to viewers. For production use, you'd persist `cycleStartTime` to SQLite and reload it on startup.

**Q: What is `defer` and why is it important for database code?**
> `defer` schedules a function to run when the surrounding function exits. For database code, `defer rows.Close()` and `defer tx.Rollback()` ensure resources are always released even if we return early due to an error. Without `defer`, early returns would leak database connections.
