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
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	roomID := strings.TrimSpace(r.URL.Query().Get(roomQueryParam))
	peerID := strings.TrimSpace(r.URL.Query().Get(peerQueryParam))

	if roomID == "" || peerID == "" {
		http.Error(w, "missing room or peer query parameter", http.StatusBadRequest)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("failed to accept websocket", "err", err)
		return
	}

	client := newClient(h, roomID, peerID, conn)

	if err := h.register(r.Context(), client); err != nil {
		var closeCode int
		var reason string
		if errors.Is(err, errPeerExists) {
			closeCode = websocket.ClosePolicyViolation
			reason = "peer already registered"
		} else {
			closeCode = websocket.CloseInternalServerErr
			reason = "failed to join room"
		}

		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(closeCode, reason),
			time.Now().Add(closeGracePeriod),
		)
		_ = conn.Close()
		return
	}

	client.run(r.Context())
}
