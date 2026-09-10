package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"multi-window-media-sequencer/backend/internal/models"
	"multi-window-media-sequencer/backend/internal/repository"
	"multi-window-media-sequencer/backend/internal/service"
	"multi-window-media-sequencer/backend/internal/websocket"
)

// Handler dispatches HTTP endpoints across domain services.
type Handler struct {
	repo        *repository.Repository
	syncService *service.SyncService
	hub         *websocket.Hub
}

// NewHandler constructs a Handler with injected dependencies.
func NewHandler(repo *repository.Repository, syncService *service.SyncService, hub *websocket.Hub) *Handler {
	return &Handler{
		repo:        repo,
		syncService: syncService,
		hub:         hub,
	}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("[Handler] JSON encoding error: %v", err)
		}
	}
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// EnableCORS injects cross-origin headers and short-circuits OPTIONS preflight requests.
func EnableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// HealthCheck responds with current server liveness metadata.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "multi-window-media-sequencer",
	})
}

// ListWindows returns all windows with ordered media playlists and computed timeline coordinates.
func (h *Handler) ListWindows(w http.ResponseWriter, r *http.Request) {
	windows, err := h.repo.GetAllWindows()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve windows: "+err.Error())
		return
	}

	now := time.Now()
	type WindowResponse struct {
		models.Window
		Timeline service.WindowTimelinePosition `json:"timeline"`
	}

	response := make([]WindowResponse, len(windows))
	for i, win := range windows {
		timeline := h.syncService.Calculate5HourCyclePosition(win.MediaItems, now)
		response[i] = WindowResponse{
			Window:   win,
			Timeline: timeline,
		}
	}

	respondJSON(w, http.StatusOK, response)
}

// CreateWindow registers a new display window entity.
func (h *Handler) CreateWindow(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload format: "+err.Error())
		return
	}

	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Window name is required")
		return
	}

	newWindow := models.Window{
		ID:         fmt.Sprintf("win-%d", time.Now().UnixNano()),
		Name:       req.Name,
		CreatedAt:  time.Now().UTC(),
		MediaItems: []models.MediaItem{},
	}

	if err := h.repo.CreateWindow(&newWindow); err != nil {
		respondError(w, http.StatusInternalServerError, "Database write failure: "+err.Error())
		return
	}

	h.hub.Broadcast(models.EventWindowAdded, newWindow)
	respondJSON(w, http.StatusCreated, newWindow)
}

// AddMediaItem appends a media asset to the targeted window playlist.
func (h *Handler) AddMediaItem(w http.ResponseWriter, r *http.Request) {
	windowID := r.PathValue("id")
	if windowID == "" {
		respondError(w, http.StatusBadRequest, "Target window ID missing from path")
		return
	}

	win, err := h.repo.GetWindowByID(windowID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database query failure: "+err.Error())
		return
	}
	if win == nil {
		respondError(w, http.StatusNotFound, "Specified window does not exist")
		return
	}

	var req struct {
		Title    string `json:"title"`
		Type     string `json:"type"`
		URL      string `json:"url"`
		Duration int    `json:"duration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload format: "+err.Error())
		return
	}

	if req.Title == "" {
		respondError(w, http.StatusBadRequest, "Media title is required")
		return
	}
	if req.Type != models.MediaTypeVideo && req.Type != models.MediaTypeImage && req.Type != models.MediaTypeBlank {
		respondError(w, http.StatusBadRequest, "Unsupported media type. Must be 'video', 'image', or 'blank'")
		return
	}
	if req.Duration <= 0 {
		req.Duration = 10
	}
	if req.Type != models.MediaTypeBlank && req.URL == "" {
		respondError(w, http.StatusBadRequest, "Asset URL is required for video and image media")
		return
	}

	item := models.MediaItem{
		ID:        fmt.Sprintf("med-%d", time.Now().UnixNano()),
		WindowID:  windowID,
		Title:     req.Title,
		Type:      req.Type,
		URL:       req.URL,
		Duration:  req.Duration,
		CreatedAt: time.Now().UTC(),
	}

	if err := h.repo.AddMediaItem(&item); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to persist media asset: "+err.Error())
		return
	}

	updatedItems, _ := h.repo.GetMediaItemsByWindowID(windowID)
	h.hub.Broadcast(models.EventPlaylistUpdated, map[string]interface{}{
		"window_id":   windowID,
		"media_items": updatedItems,
	})

	respondJSON(w, http.StatusCreated, item)
}

// DeleteMediaItem removes an asset and re-indexes sequence positions.
func (h *Handler) DeleteMediaItem(w http.ResponseWriter, r *http.Request) {
	mediaID := r.PathValue("id")
	if mediaID == "" {
		respondError(w, http.StatusBadRequest, "Media item ID missing from path")
		return
	}

	item, err := h.repo.GetMediaItemByID(mediaID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Database query failure: "+err.Error())
		return
	}
	if item == nil {
		respondError(w, http.StatusNotFound, "Media item does not exist")
		return
	}

	windowID := item.WindowID
	if err := h.repo.DeleteMediaItem(mediaID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete media asset: "+err.Error())
		return
	}

	updatedItems, _ := h.repo.GetMediaItemsByWindowID(windowID)
	h.hub.Broadcast(models.EventPlaylistUpdated, map[string]interface{}{
		"window_id":   windowID,
		"media_items": updatedItems,
	})

	respondJSON(w, http.StatusOK, map[string]string{
		"message":   "Asset deleted successfully",
		"media_id":  mediaID,
		"window_id": windowID,
	})
}

// GetSyncStatus retrieves the active synchronized override state.
func (h *Handler) GetSyncStatus(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.syncService.GetSyncState())
}

// TriggerSync initiates an atomic synchronized playback override across all viewports.
func (h *Handler) TriggerSync(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MediaItemID     string `json:"media_item_id"`
		DurationSeconds int    `json:"duration_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload format: "+err.Error())
		return
	}

	if req.MediaItemID == "" {
		respondError(w, http.StatusBadRequest, "media_item_id is required")
		return
	}
	if req.DurationSeconds <= 0 {
		req.DurationSeconds = 15
	}

	state, err := h.syncService.TriggerSync(req.MediaItemID, req.DurationSeconds)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, state)
}

// StopSync terminates an active synchronized playback override.
func (h *Handler) StopSync(w http.ResponseWriter, r *http.Request) {
	if err := h.syncService.StopSync(); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to terminate sync override: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "Sync override cancelled"})
}

// HandleWebSocket establishes a persistent bi-directional connection with the client.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	websocket.ServeWs(h.hub, w, r)
}
