package signaling

import (
	"context"
	"errors"
	"log/slog"
	"sync"
)

var (
	errPeerExists = errors.New("peer already registered")
)

// Hub manages signaling rooms and routes messages between peers.
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]*room
	logger *slog.Logger
}

// NewHub constructs a Hub. If logger is nil, slog.Default is used.
func NewHub(logger *slog.Logger) *Hub {
	if logger == nil {
		logger = slog.Default()
	}

	return &Hub{
		rooms:  make(map[string]*room),
		logger: logger.With("component", "signaling"),
	}
}

func (h *Hub) register(ctx context.Context, c *Client) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	r, ok := h.rooms[c.roomID]
	if !ok {
		r = newRoom(c.roomID, h.logger)
		h.rooms[c.roomID] = r
	}

	if err := r.addClient(c); err != nil {
		return err
	}

	h.logger.InfoContext(ctx, "peer joined", "room", c.roomID, "peer", c.peerID)
	return nil
}

func (h *Hub) unregister(ctx context.Context, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	r, ok := h.rooms[c.roomID]
	if !ok {
		return
	}

	r.removeClient(c.peerID)

	if r.len() == 0 {
		delete(h.rooms, c.roomID)
	}

	h.logger.InfoContext(ctx, "peer left", "room", c.roomID, "peer", c.peerID)
}

func (h *Hub) dispatch(ctx context.Context, from *Client, msg Message) {
	h.mu.Lock()
	r, ok := h.rooms[from.roomID]
	h.mu.Unlock()
	if !ok {
		from.sendError("room closed")
		return
	}

	msg.From = from.peerID

	r.dispatch(ctx, from, msg)
}

// room keeps track of peers within the same logical signaling session.
type room struct {
	id      string
	logger  *slog.Logger
	mu      sync.RWMutex
	clients map[string]*Client
}

func newRoom(id string, logger *slog.Logger) *room {
	return &room{
		id:      id,
		logger:  logger.With("room", id),
		clients: make(map[string]*Client),
	}
}

func (r *room) addClient(c *Client) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.clients[c.peerID]; exists {
		return errPeerExists
	}

	r.clients[c.peerID] = c
	return nil
}

func (r *room) removeClient(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.clients, peerID)
}

func (r *room) len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.clients)
}

func (r *room) dispatch(ctx context.Context, from *Client, msg Message) {
	payload, err := from.formatMessage(msg)
	if err != nil {
		from.sendError("failed to encode message")
		return
	}

	if msg.To != "" {
		target := r.getClient(msg.To)
		if target == nil {
			from.sendError("target peer not found")
			return
		}

		target.enqueue(payload)
		return
	}

	for _, client := range r.listExcept(from.peerID) {
		client.enqueue(payload)
	}
}

func (r *room) getClient(peerID string) *Client {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.clients[peerID]
}

func (r *room) listExcept(peerID string) []*Client {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]*Client, 0, len(r.clients))
	for id, client := range r.clients {
		if id == peerID {
			continue
		}
		out = append(out, client)
	}

	return out
}
