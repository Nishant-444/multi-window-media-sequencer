package repository

import (
	"database/sql"
	"fmt"
	"time"

	"multi-window-media-sequencer/backend/internal/models"
)

// Repository exposes data access primitives for displays, playlists, and sync state.
type Repository struct {
	db *sql.DB
}

// NewRepository constructs a Repository backed by the provided SQL connection pool.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// GetAllWindows returns all registered display windows populated with ordered media items.
func (r *Repository) GetAllWindows() ([]models.Window, error) {
	rows, err := r.db.Query("SELECT id, name, created_at FROM windows ORDER BY created_at ASC")
	if err != nil {
		return nil, fmt.Errorf("querying windows: %w", err)
	}
	defer rows.Close()

	var windows []models.Window
	for rows.Next() {
		var w models.Window
		if err := rows.Scan(&w.ID, &w.Name, &w.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning window row: %w", err)
		}
		windows = append(windows, w)
	}

	for i := range windows {
		items, err := r.GetMediaItemsByWindowID(windows[i].ID)
		if err != nil {
			return nil, err
		}
		windows[i].MediaItems = items
	}

	return windows, nil
}

// GetWindowByID retrieves a window entity by primary key.
func (r *Repository) GetWindowByID(id string) (*models.Window, error) {
	var w models.Window
	err := r.db.QueryRow("SELECT id, name, created_at FROM windows WHERE id = ?", id).
		Scan(&w.ID, &w.Name, &w.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("querying window: %w", err)
	}

	items, err := r.GetMediaItemsByWindowID(w.ID)
	if err != nil {
		return nil, err
	}
	w.MediaItems = items

	return &w, nil
}

// CreateWindow persists a new display screen entity.
func (r *Repository) CreateWindow(w *models.Window) error {
	query := "INSERT INTO windows (id, name, created_at) VALUES (?, ?, ?)"
	if _, err := r.db.Exec(query, w.ID, w.Name, w.CreatedAt); err != nil {
		return fmt.Errorf("inserting window: %w", err)
	}
	return nil
}

// GetMediaItemsByWindowID fetches playlist assets ordered by their sequence position.
func (r *Repository) GetMediaItemsByWindowID(windowID string) ([]models.MediaItem, error) {
	query := `
		SELECT id, window_id, title, type, url, duration, position, created_at
		FROM media_items
		WHERE window_id = ?
		ORDER BY position ASC
	`
	rows, err := r.db.Query(query, windowID)
	if err != nil {
		return nil, fmt.Errorf("querying media items: %w", err)
	}
	defer rows.Close()

	items := make([]models.MediaItem, 0)
	for rows.Next() {
		var m models.MediaItem
		if err := rows.Scan(&m.ID, &m.WindowID, &m.Title, &m.Type, &m.URL, &m.Duration, &m.Position, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning media item: %w", err)
		}
		items = append(items, m)
	}

	return items, nil
}

// GetMediaItemByID retrieves a single media item by primary key.
func (r *Repository) GetMediaItemByID(id string) (*models.MediaItem, error) {
	query := `
		SELECT id, window_id, title, type, url, duration, position, created_at
		FROM media_items
		WHERE id = ?
	`
	var m models.MediaItem
	err := r.db.QueryRow(query, id).
		Scan(&m.ID, &m.WindowID, &m.Title, &m.Type, &m.URL, &m.Duration, &m.Position, &m.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("querying media item: %w", err)
	}
	return &m, nil
}

// AddMediaItem appends a media asset to the terminal position of the window playlist.
func (r *Repository) AddMediaItem(m *models.MediaItem) error {
	var maxPos sql.NullInt64
	err := r.db.QueryRow("SELECT MAX(position) FROM media_items WHERE window_id = ?", m.WindowID).Scan(&maxPos)
	if err != nil {
		return fmt.Errorf("resolving tail sequence position: %w", err)
	}

	nextPos := 0
	if maxPos.Valid {
		nextPos = int(maxPos.Int64) + 1
	}
	m.Position = nextPos

	query := `
		INSERT INTO media_items (id, window_id, title, type, url, duration, position, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	if _, err := r.db.Exec(query, m.ID, m.WindowID, m.Title, m.Type, m.URL, m.Duration, m.Position, m.CreatedAt); err != nil {
		return fmt.Errorf("inserting media item: %w", err)
	}

	return nil
}

// DeleteMediaItem removes an asset and compacts subsequent sequence positions within a single transaction.
func (r *Repository) DeleteMediaItem(id string) error {
	item, err := r.GetMediaItemByID(id)
	if err != nil {
		return err
	}
	if item == nil {
		return fmt.Errorf("media item not found")
	}

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM media_items WHERE id = ?", id); err != nil {
		return fmt.Errorf("deleting media item: %w", err)
	}

	if _, err := tx.Exec(`
		UPDATE media_items 
		SET position = position - 1 
		WHERE window_id = ? AND position > ?
	`, item.WindowID, item.Position); err != nil {
		return fmt.Errorf("compacting playlist sequence: %w", err)
	}

	return tx.Commit()
}

// SaveSyncState updates the singleton sync state row.
func (r *Repository) SaveSyncState(isActive bool, mediaItemID string, duration int, startedAt, endsAt *time.Time) error {
	query := `
		UPDATE sync_state 
		SET is_active = ?, media_item_id = ?, duration = ?, started_at = ?, ends_at = ?
		WHERE id = 1
	`
	if _, err := r.db.Exec(query, isActive, mediaItemID, duration, startedAt, endsAt); err != nil {
		return fmt.Errorf("updating sync_state: %w", err)
	}
	return nil
}

// LoadSyncState fetches the current persisted sync state record.
func (r *Repository) LoadSyncState() (*models.SyncState, error) {
	query := "SELECT is_active, media_item_id, duration, started_at, ends_at FROM sync_state WHERE id = 1"
	var isActive bool
	var mediaItemID sql.NullString
	var duration int
	var startedAt, endsAt sql.NullTime

	if err := r.db.QueryRow(query).Scan(&isActive, &mediaItemID, &duration, &startedAt, &endsAt); err != nil {
		return nil, fmt.Errorf("loading sync state: %w", err)
	}

	state := &models.SyncState{
		IsActive:        isActive,
		DurationSeconds: duration,
	}

	if startedAt.Valid {
		state.StartedAt = &startedAt.Time
	}
	if endsAt.Valid {
		state.EndsAt = &endsAt.Time
	}

	if mediaItemID.Valid && mediaItemID.String != "" {
		item, err := r.GetMediaItemByID(mediaItemID.String)
		if err == nil && item != nil {
			state.MediaItem = item
		}
	}

	return state, nil
}
