package events_test

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"taskflow/internal/events"
)

func TestHub_SubscribePublishReceive(t *testing.T) {
	h := events.NewHub()
	userID := uuid.New()

	ch, cancel := h.Subscribe(userID)
	defer cancel()

	msg := []byte(`{"type":"task.created"}`)
	h.Publish(userID, msg)

	select {
	case got := <-ch:
		if string(got) != string(msg) {
			t.Fatalf("got %q, want %q", got, msg)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
	}
}

func TestHub_TwoSubscribersSameUserBothReceive(t *testing.T) {
	h := events.NewHub()
	userID := uuid.New()

	ch1, cancel1 := h.Subscribe(userID)
	defer cancel1()
	ch2, cancel2 := h.Subscribe(userID)
	defer cancel2()

	msg := []byte(`{"type":"task.updated"}`)
	h.Publish(userID, msg)

	for i, ch := range []<-chan []byte{ch1, ch2} {
		select {
		case got := <-ch:
			if string(got) != string(msg) {
				t.Fatalf("subscriber %d: got %q, want %q", i+1, got, msg)
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber %d: timed out", i+1)
		}
	}
}

func TestHub_OtherUserReceivesNothing(t *testing.T) {
	h := events.NewHub()
	userA := uuid.New()
	userB := uuid.New()

	ch, cancel := h.Subscribe(userA)
	defer cancel()

	h.Publish(userB, []byte(`{"type":"task.deleted"}`))

	select {
	case got := <-ch:
		t.Fatalf("unexpected message for other user: %q", got)
	case <-time.After(50 * time.Millisecond):
		// correct: no message
	}
}

func TestHub_CancelRemovesAndCloses(t *testing.T) {
	h := events.NewHub()
	userID := uuid.New()

	ch, cancel := h.Subscribe(userID)
	cancel() // unsubscribe

	// Channel must be closed after cancel.
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("channel should be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("channel was not closed")
	}

	// Publishing after cancel must not panic.
	h.Publish(userID, []byte(`{"type":"task.created"}`))
}

func TestHub_SlowSubscriberSkipped(t *testing.T) {
	h := events.NewHub()
	userID := uuid.New()

	_, cancel := h.Subscribe(userID)
	defer cancel()

	// Fill the buffer (cap 8).
	for i := 0; i < 8; i++ {
		h.Publish(userID, []byte(`{"type":"task.created"}`))
	}

	// This extra publish must return immediately without blocking (slow subscriber skip).
	done := make(chan struct{})
	go func() {
		h.Publish(userID, []byte(`{"type":"task.created"}`))
		close(done)
	}()

	select {
	case <-done:
		// correct: returned immediately
	case <-time.After(time.Second):
		t.Fatal("Publish blocked on slow subscriber")
	}
}

func TestHub_ConcurrentPublishSubscribe(t *testing.T) {
	// Run with -race to detect data races.
	h := events.NewHub()
	userID := uuid.New()

	var wg sync.WaitGroup
	const goroutines = 20

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch, cancel := h.Subscribe(userID)
			h.Publish(userID, []byte(`{"type":"task.created"}`))
			// Drain or skip, then cancel.
			select {
			case <-ch:
			default:
			}
			cancel()
		}()
	}

	wg.Wait()
}
