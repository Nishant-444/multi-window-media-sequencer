package service

import (
	"fmt"
	"log"
	"sync"
	"time"

	"multi-window-media-sequencer/backend/internal/models"
	"multi-window-media-sequencer/backend/internal/repository"
	"multi-window-media-sequencer/backend/internal/websocket"
)

// FiveHourCycleDuration models the 18,000-second sequence loop requirement.
const FiveHourCycleDuration = 5 * 3600

// SyncService orchestrates stateful synchronized overrides and continuous timeline calculations.
type SyncService struct {
	mu             sync.Mutex
	syncState      models.SyncState
	cycleStartTime time.Time
	timerCancel    chan struct{}
	repo           *repository.Repository
	hub            *websocket.Hub
}

// NewSyncService restores persistent sync state and initializes the timeline reference point.
func NewSyncService(repo *repository.Repository, hub *websocket.Hub) (*SyncService, error) {
	persistedState, err := repo.LoadSyncState()
	if err != nil {
		return nil, fmt.Errorf("recovering sync state: %w", err)
	}

	svc := &SyncService{
		repo:           repo,
		hub:            hub,
		cycleStartTime: time.Now(),
	}

	if persistedState != nil {
		svc.syncState = *persistedState
		if svc.syncState.IsActive && svc.syncState.EndsAt != nil {
			remaining := time.Until(*svc.syncState.EndsAt)
			if remaining > 0 {
				log.Printf("[SyncService] Resuming active override session (%v remaining)", remaining)
				svc.scheduleSyncExpiration(remaining)
			} else {
				svc.syncState.IsActive = false
			}
		}
	}

	return svc, nil
}

// GetSyncState returns an atomic snapshot of the current sync state with updated duration metrics.
func (s *SyncService) GetSyncState() models.SyncState {
	s.mu.Lock()
	defer s.mu.Unlock()

	stateCopy := s.syncState
	if stateCopy.IsActive && stateCopy.EndsAt != nil {
		rem := int(time.Until(*stateCopy.EndsAt).Seconds())
		if rem < 0 {
			rem = 0
		}
		stateCopy.RemainingSeconds = rem
	} else {
		stateCopy.RemainingSeconds = 0
	}

	return stateCopy
}

// TriggerSync initiates an atomic synchronized playback override across all connected viewports.
func (s *SyncService) TriggerSync(mediaItemID string, durationSec int) (*models.SyncState, error) {
	item, err := s.repo.GetMediaItemByID(mediaItemID)
	if err != nil {
		return nil, fmt.Errorf("resolving media entity: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("media entity '%s' does not exist", mediaItemID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Cancel any active countdown timer before arming a new override
	if s.timerCancel != nil {
		close(s.timerCancel)
		s.timerCancel = nil
	}

	now := time.Now()
	endsAt := now.Add(time.Duration(durationSec) * time.Second)

	s.syncState = models.SyncState{
		IsActive:         true,
		MediaItem:        item,
		DurationSeconds:  durationSec,
		StartedAt:        &now,
		EndsAt:           &endsAt,
		RemainingSeconds: durationSec,
	}

	if err := s.repo.SaveSyncState(true, item.ID, durationSec, &now, &endsAt); err != nil {
		log.Printf("[SyncService] Persistence error: %v", err)
	}

	cancelChan := make(chan struct{})
	s.timerCancel = cancelChan

	// Asynchronous countdown timer to automatically terminate the override upon expiry
	go func(duration time.Duration, cancel <-chan struct{}) {
		timer := time.NewTimer(duration)
		defer timer.Stop()

		select {
		case <-timer.C:
			log.Printf("[SyncService] Override window completed (%v). Restoring default sequences.", duration)
			s.StopSyncInternal()

		case <-cancel:
			log.Println("[SyncService] Override aborted prematurely via administrative cancel.")
			return
		}
	}(time.Duration(durationSec)*time.Second, cancelChan)

	s.hub.Broadcast(models.EventSyncStart, s.syncState)
	log.Printf("[SyncService] Dispatched SYNC_START: Asset '%s' for %ds", item.Title, durationSec)

	return &s.syncState, nil
}

// StopSync terminates an in-flight synchronized override and restores individual sequences.
func (s *SyncService) StopSync() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.syncState.IsActive {
		return nil
	}

	if s.timerCancel != nil {
		close(s.timerCancel)
		s.timerCancel = nil
	}

	s.syncState.IsActive = false
	s.syncState.MediaItem = nil
	s.syncState.RemainingSeconds = 0

	s.repo.SaveSyncState(false, "", 0, nil, nil)
	s.hub.Broadcast(models.EventSyncEnd, map[string]string{"message": "Sync playback ended"})
	log.Println("[SyncService] Dispatched SYNC_END: Restoring window sequences.")

	return nil
}

// StopSyncInternal updates state and dispatches SYNC_END when a timer expires naturally.
func (s *SyncService) StopSyncInternal() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.syncState.IsActive = false
	s.syncState.MediaItem = nil
	s.syncState.RemainingSeconds = 0
	s.timerCancel = nil

	s.repo.SaveSyncState(false, "", 0, nil, nil)
	s.hub.Broadcast(models.EventSyncEnd, map[string]string{"message": "Sync playback completed"})
}

func (s *SyncService) scheduleSyncExpiration(remaining time.Duration) {
	cancelChan := make(chan struct{})
	s.timerCancel = cancelChan

	go func() {
		select {
		case <-time.After(remaining):
			s.StopSyncInternal()
		case <-cancelChan:
			return
		}
	}()
}

// WindowTimelinePosition provides deterministic playback coordinates within the 5-hour cycle.
type WindowTimelinePosition struct {
	TotalPlaylistDuration int               `json:"total_playlist_duration"`
	CycleElapsedSeconds   int               `json:"cycle_elapsed_seconds"`
	PlaylistOffsetSeconds int               `json:"playlist_offset_seconds"`
	CurrentItemIndex      int               `json:"current_item_index"`
	CurrentItem           *models.MediaItem `json:"current_item,omitempty"`
	ItemElapsedSeconds    int               `json:"item_elapsed_seconds"`
	ItemRemainingSeconds  int               `json:"item_remaining_seconds"`
}

// Calculate5HourCyclePosition evaluates the exact timeline coordinates for a window's playlist.
// Total cycle length is 5 hours (18,000s). The configured playlist repeats continuously within that cycle.
func (s *SyncService) Calculate5HourCyclePosition(items []models.MediaItem, targetTime time.Time) WindowTimelinePosition {
	result := WindowTimelinePosition{}

	if len(items) == 0 {
		return result
	}

	totalDuration := 0
	for _, it := range items {
		totalDuration += it.Duration
	}
	result.TotalPlaylistDuration = totalDuration

	if totalDuration <= 0 {
		return result
	}

	elapsedSinceStart := int(targetTime.Sub(s.cycleStartTime).Seconds())
	if elapsedSinceStart < 0 {
		elapsedSinceStart = 0
	}
	cycleElapsed := elapsedSinceStart % FiveHourCycleDuration
	result.CycleElapsedSeconds = cycleElapsed

	playlistOffset := cycleElapsed % totalDuration
	result.PlaylistOffsetSeconds = playlistOffset

	accumulated := 0
	for idx, it := range items {
		if playlistOffset >= accumulated && playlistOffset < (accumulated+it.Duration) {
			result.CurrentItemIndex = idx
			result.CurrentItem = &items[idx]
			result.ItemElapsedSeconds = playlistOffset - accumulated
			result.ItemRemainingSeconds = it.Duration - result.ItemElapsedSeconds
			break
		}
		accumulated += it.Duration
	}

	return result
}
