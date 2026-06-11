// Package events provides a fan-out hub that delivers task events to per-user
// SSE subscribers. A single in-process Hub is used; the README documents
// Redis pub/sub as the scale-out path.
package events

import (
	"sync"

	"github.com/google/uuid"
)

// Hub fans task events out to per-user subscriber channels.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan []byte]struct{}
}

// NewHub creates a ready-to-use Hub.
func NewHub() *Hub {
	return &Hub{
		subs: make(map[uuid.UUID]map[chan []byte]struct{}),
	}
}

// Subscribe returns a buffered channel (cap 8) and a cancel func that
// unsubscribes and closes the channel. Safe for concurrent use.
func (h *Hub) Subscribe(userID uuid.UUID) (<-chan []byte, func()) {
	ch := make(chan []byte, 8)

	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = make(map[chan []byte]struct{})
	}
	h.subs[userID][ch] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		if _, ok := h.subs[userID][ch]; ok {
			delete(h.subs[userID], ch)
			if len(h.subs[userID]) == 0 {
				delete(h.subs, userID)
			}
			close(ch)
		}
		h.mu.Unlock()
	}
	return ch, cancel
}

// Publish delivers data to every subscriber of userID. Slow subscribers
// (full buffer) are skipped — events are best-effort wakeups, never blocking.
func (h *Hub) Publish(userID uuid.UUID, data []byte) {
	// Hold write lock for the entire send loop so that cancel() (which also
	// holds the write lock) cannot close a channel while we are sending to it.
	// The default case keeps this non-blocking even under contention.
	h.mu.Lock()
	for ch := range h.subs[userID] {
		select {
		case ch <- data:
		default:
			// Slow subscriber: skip without blocking.
		}
	}
	h.mu.Unlock()
}
