package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"multi-window-media-sequencer/backend/internal/database"
	"multi-window-media-sequencer/backend/internal/handlers"
	"multi-window-media-sequencer/backend/internal/repository"
	"multi-window-media-sequencer/backend/internal/service"
	"multi-window-media-sequencer/backend/internal/websocket"
)

func main() {
	log.Println("[Server] Starting Multi-Window Media Sequencer Backend")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "media_sequencer.db"
	}

	// Initialize SQLite database connection pool and run relational migrations
	db, err := database.InitDB(dbPath)
	if err != nil {
		log.Fatalf("[Fatal] Database initialization failure: %v", err)
	}
	defer db.Close()

	if err := database.SeedDatabase(db); err != nil {
		log.Fatalf("[Fatal] Database seeding failure: %v", err)
	}

	repo := repository.NewRepository(db)
	hub := websocket.NewHub()

	// Run the WebSocket hub loop on a dedicated goroutine
	go hub.Run()

	syncSvc, err := service.NewSyncService(repo, hub)
	if err != nil {
		log.Fatalf("[Fatal] Sync service initialization failure: %v", err)
	}

	handler := handlers.NewHandler(repo, syncSvc, hub)

	// Configure routing table using standard library net/http ServeMux
	mux := http.NewServeMux()

	// Health & System
	mux.HandleFunc("GET /api/health", handler.HealthCheck)

	// Displays & Playlists
	mux.HandleFunc("GET /api/windows", handler.ListWindows)
	mux.HandleFunc("POST /api/windows", handler.CreateWindow)
	mux.HandleFunc("POST /api/windows/{id}/media", handler.AddMediaItem)
	mux.HandleFunc("DELETE /api/media/{id}", handler.DeleteMediaItem)

	// Synchronized Playback Control
	mux.HandleFunc("GET /api/sync/status", handler.GetSyncStatus)
	mux.HandleFunc("POST /api/sync", handler.TriggerSync)
	mux.HandleFunc("POST /api/sync/stop", handler.StopSync)

	// WebSocket Channel
	mux.HandleFunc("GET /ws", handler.HandleWebSocket)

	serverHandler := handlers.EnableCORS(mux)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      serverHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start HTTP listener asynchronously to enable graceful OS signal traps
	go func() {
		log.Printf("[Server] HTTP service listening on :%s", port)
		log.Printf("[Server] WebSocket channel ready on ws://:%s/ws", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Fatal] HTTP listener aborted: %v", err)
		}
	}()

	// Block until SIGINT or SIGTERM is intercepted
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	sig := <-quit
	log.Printf("[Server] Intercepted signal %v. Commencing graceful shutdown...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[Server] Forced shutdown: %v", err)
	} else {
		log.Println("[Server] Graceful shutdown completed.")
	}
}
