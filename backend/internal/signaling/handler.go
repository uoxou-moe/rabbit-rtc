package signaling

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	roomQueryParam = "room"
	peerQueryParam = "peer"

	closeGracePeriod = 2 * time.Second
)

func newUpgrader(policy originPolicy, logger *slog.Logger) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if policy.allows(origin) {
				return true
			}
			logger.Warn("rejecting websocket origin", "origin", origin, "remote", r.RemoteAddr)
			return false
		},
	}
}

// ServeWS upgrades an HTTP request to a WebSocket connection and
// registers the peer into the signaling hub.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method != http.MethodGet {
		h.logger.WarnContext(ctx, "websocket request rejected: invalid method", "method", r.Method, "remote", r.RemoteAddr)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	roomID := strings.TrimSpace(r.URL.Query().Get(roomQueryParam))
	peerID := strings.TrimSpace(r.URL.Query().Get(peerQueryParam))

	if roomID == "" || peerID == "" {
		h.logger.WarnContext(ctx, "websocket request rejected: missing parameters", "room", roomID, "peer", peerID, "remote", r.RemoteAddr)
		http.Error(w, "missing room or peer query parameter", http.StatusBadRequest)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to accept websocket", "err", err, "room", roomID, "peer", peerID, "remote", r.RemoteAddr)
		return
	}

	client := newClient(h, roomID, peerID, conn)

	if err := h.register(ctx, client); err != nil {
		var closeCode int
		var reason string
		if errors.Is(err, errPeerExists) {
			closeCode = websocket.ClosePolicyViolation
			reason = "peer already registered"
		} else {
			closeCode = websocket.CloseInternalServerErr
			reason = "failed to join room"
		}

		h.logger.WarnContext(ctx, "closing websocket after register failure", "room", roomID, "peer", peerID, "close_code", closeCode, "reason", reason, "err", err)
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(closeCode, reason),
			time.Now().Add(closeGracePeriod),
		)
		_ = conn.Close()
		return
	}

	h.logger.InfoContext(ctx, "websocket client registered", "room", roomID, "peer", peerID, "remote", r.RemoteAddr)
	client.run(ctx)
	h.logger.InfoContext(ctx, "websocket client disconnected", "room", roomID, "peer", peerID)
}
