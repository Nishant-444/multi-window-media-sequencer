package models

import "time"

// Supported media types within the playback sequencer.
const (
	MediaTypeVideo = "video"
	MediaTypeImage = "image"
	MediaTypeBlank = "blank"
)

// MediaItem models an individual asset scheduled within a window's playlist.
type MediaItem struct {
	ID        string    `json:"id"`
	WindowID  string    `json:"window_id"`
	Title     string    `json:"title"`
	Type      string    `json:"type"` // video, image, blank
	URL       string    `json:"url"`  // Asset URI; empty string when Type is blank
	Duration  int       `json:"duration"` // Display duration in seconds
	Position  int       `json:"position"` // 0-indexed ordinal sequence within the playlist
	CreatedAt time.Time `json:"created_at"`
}

// Window models an independent display viewport with an assigned sequence of media items.
type Window struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	CreatedAt  time.Time   `json:"created_at"`
	MediaItems []MediaItem `json:"media_items"`
}

// SyncState encapsulates global synchronized playback override state.
type SyncState struct {
	IsActive         bool       `json:"is_active"`
	MediaItem        *MediaItem `json:"media_item,omitempty"`
	DurationSeconds  int        `json:"duration_seconds"`
	StartedAt        *time.Time `json:"started_at,omitempty"`
	EndsAt           *time.Time `json:"ends_at,omitempty"`
	RemainingSeconds int        `json:"remaining_seconds"`
}

// WSMessage represents the standard transmission frame dispatched over WebSocket connections.
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// WebSocket broadcast event identifiers.
const (
	EventInitialState    = "INITIAL_STATE"
	EventSyncStart       = "SYNC_START"
	EventSyncEnd         = "SYNC_END"
	EventPlaylistUpdated = "PLAYLIST_UPDATED"
	EventWindowAdded     = "WINDOW_ADDED"
)
