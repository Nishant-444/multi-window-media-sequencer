package database

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

// InitDB configures the SQLite connection pool and ensures the relational schema is initialized.
func InitDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize sqlite driver: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping sqlite database: %w", err)
	}

	// SQLite file locking semantics require single-writer serialization to prevent SQLITE_BUSY contention.
	db.SetMaxOpenConns(1)

	if err := createSchema(db); err != nil {
		return nil, fmt.Errorf("schema initialization failed: %w", err)
	}

	log.Printf("[Database] Initialized SQLite at %s", dbPath)
	return db, nil
}

// createSchema applies DDL constraints for windows, playlist items, and persistent sync override state.
func createSchema(db *sql.DB) error {
	schema := `
	PRAGMA foreign_keys = ON;

	CREATE TABLE IF NOT EXISTS windows (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		created_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS media_items (
		id TEXT PRIMARY KEY,
		window_id TEXT NOT NULL,
		title TEXT NOT NULL,
		type TEXT NOT NULL CHECK(type IN ('video', 'image', 'blank')),
		url TEXT NOT NULL DEFAULT '',
		duration INTEGER NOT NULL,
		position INTEGER NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY(window_id) REFERENCES windows(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_media_items_window_pos ON media_items(window_id, position);

	CREATE TABLE IF NOT EXISTS sync_state (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		is_active BOOLEAN NOT NULL DEFAULT 0,
		media_item_id TEXT,
		duration INTEGER NOT NULL DEFAULT 0,
		started_at DATETIME,
		ends_at DATETIME
	);
	`

	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("executing schema ddl: %w", err)
	}

	_, err := db.Exec(`INSERT OR IGNORE INTO sync_state (id, is_active, duration) VALUES (1, 0, 0);`)
	return err
}
