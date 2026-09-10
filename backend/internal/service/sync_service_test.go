package service

import (
	"testing"
	"time"

	"multi-window-media-sequencer/backend/internal/models"
)

func TestCalculate5HourCyclePosition(t *testing.T) {
	svc := &SyncService{
		cycleStartTime: time.Now().Add(-100 * time.Second),
	}

	items := []models.MediaItem{
		{ID: "1", Title: "Item A", Duration: 10, Position: 0},
		{ID: "2", Title: "Item B", Duration: 20, Position: 1},
		{ID: "3", Title: "Item C", Duration: 30, Position: 2},
	}

	targetTime := svc.cycleStartTime.Add(100 * time.Second)
	pos := svc.Calculate5HourCyclePosition(items, targetTime)

	if pos.TotalPlaylistDuration != 60 {
		t.Fatalf("expected total playlist duration 60, got %d", pos.TotalPlaylistDuration)
	}

	if pos.PlaylistOffsetSeconds != 40 {
		t.Fatalf("expected playlist offset 40, got %d", pos.PlaylistOffsetSeconds)
	}

	if pos.CurrentItemIndex != 2 {
		t.Fatalf("expected current item index 2, got %d", pos.CurrentItemIndex)
	}

	if pos.ItemElapsedSeconds != 10 {
		t.Fatalf("expected item elapsed seconds 10, got %d", pos.ItemElapsedSeconds)
	}

	if pos.ItemRemainingSeconds != 20 {
		t.Fatalf("expected item remaining seconds 20, got %d", pos.ItemRemainingSeconds)
	}
}

func Test5HourCycleBoundaryWrap(t *testing.T) {
	svc := &SyncService{
		cycleStartTime: time.Now(),
	}

	items := []models.MediaItem{
		{ID: "1", Title: "Item 1", Duration: 15, Position: 0},
		{ID: "2", Title: "Item 2", Duration: 15, Position: 1},
	}

	targetTime := svc.cycleStartTime.Add(18010 * time.Second)
	pos := svc.Calculate5HourCyclePosition(items, targetTime)

	if pos.CycleElapsedSeconds != 10 {
		t.Fatalf("expected cycle elapsed 10, got %d", pos.CycleElapsedSeconds)
	}

	if pos.PlaylistOffsetSeconds != 10 {
		t.Fatalf("expected playlist offset 10, got %d", pos.PlaylistOffsetSeconds)
	}

	if pos.CurrentItemIndex != 0 {
		t.Fatalf("expected current item index 0, got %d", pos.CurrentItemIndex)
	}
}

func TestEmptyPlaylistHandling(t *testing.T) {
	svc := &SyncService{
		cycleStartTime: time.Now(),
	}

	pos := svc.Calculate5HourCyclePosition([]models.MediaItem{}, time.Now())
	if pos.TotalPlaylistDuration != 0 {
		t.Fatalf("expected 0 duration for empty items, got %d", pos.TotalPlaylistDuration)
	}
	if pos.CurrentItem != nil {
		t.Fatalf("expected nil current item for empty playlist")
	}
}
