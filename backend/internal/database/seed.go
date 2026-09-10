package database

import (
	"database/sql"
	"log"
	"time"

	"multi-window-media-sequencer/backend/internal/models"
)

// SeedDatabase verifies dataset presence and populates baseline windows and media fixtures if empty.
func SeedDatabase(db *sql.DB) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM windows").Scan(&count); err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	log.Println("[Database] Seeding initial display screens and playlist configurations...")

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().UTC()

	windows := []models.Window{
		{ID: "win-1", Name: "Window 1 - Main Lobby Display", CreatedAt: now},
		{ID: "win-2", Name: "Window 2 - Storefront Showcase", CreatedAt: now},
		{ID: "win-3", Name: "Window 3 - Executive Lounge", CreatedAt: now},
	}

	for _, w := range windows {
		if _, err := tx.Exec("INSERT INTO windows (id, name, created_at) VALUES (?, ?, ?)", w.ID, w.Name, w.CreatedAt); err != nil {
			return err
		}
	}

	mediaItems := []models.MediaItem{
		// Window 1: Video -> Image -> Video
		{
			ID: "med-101", WindowID: "win-1", Title: "Nature Wildlife Showcase",
			Type: models.MediaTypeVideo,
			URL: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
			Duration: 15, Position: 0, CreatedAt: now,
		},
		{
			ID: "med-102", WindowID: "win-1", Title: "Modern Architecture Poster",
			Type: models.MediaTypeImage,
			URL: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
			Duration: 10, Position: 1, CreatedAt: now,
		},
		{
			ID: "med-103", WindowID: "win-1", Title: "Tech Innovation Reel",
			Type: models.MediaTypeVideo,
			URL: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
			Duration: 15, Position: 2, CreatedAt: now,
		},

		// Window 2: Image -> Video -> Blank Fallback -> Image
		{
			ID: "med-201", WindowID: "win-2", Title: "Retail Fashion Promo",
			Type: models.MediaTypeImage,
			URL: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
			Duration: 10, Position: 0, CreatedAt: now,
		},
		{
			ID: "med-202", WindowID: "win-2", Title: "Product Showcase Video",
			Type: models.MediaTypeVideo,
			URL: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
			Duration: 15, Position: 1, CreatedAt: now,
		},
		{
			ID: "med-203", WindowID: "win-2", Title: "Ambient Intermission (Blank)",
			Type: models.MediaTypeBlank,
			URL: "",
			Duration: 5, Position: 2, CreatedAt: now,
		},
		{
			ID: "med-204", WindowID: "win-2", Title: "Urban Minimalist Gallery",
			Type: models.MediaTypeImage,
			URL: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
			Duration: 12, Position: 3, CreatedAt: now,
		},

		// Window 3: Video -> Image
		{
			ID: "med-301", WindowID: "win-3", Title: "Cinematic Sci-Fi Clip",
			Type: models.MediaTypeVideo,
			URL: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
			Duration: 20, Position: 0, CreatedAt: now,
		},
		{
			ID: "med-302", WindowID: "win-3", Title: "Serene Mountain Sunrise",
			Type: models.MediaTypeImage,
			URL: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
			Duration: 10, Position: 1, CreatedAt: now,
		},
	}

	for _, m := range mediaItems {
		_, err := tx.Exec(`
			INSERT INTO media_items (id, window_id, title, type, url, duration, position, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, m.ID, m.WindowID, m.Title, m.Type, m.URL, m.Duration, m.Position, m.CreatedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}
