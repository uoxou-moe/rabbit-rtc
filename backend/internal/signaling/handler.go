package signaling

import (
	"net/http"
	"strings"

	"nhooyr.io/websocket"
)

const (
	roomQueryParam = "room"
	peerQueryParam = "peer"
)

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

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		h.logger.Error("failed to accept websocket", "err", err)
		return
	}

	client := newClient(h, roomID, peerID, conn)

	if err := h.register(r.Context(), client); err != nil {
		status := websocket.StatusInternalError
		closeReason := "failed to join room"
		if err == errPeerExists {
			status = websocket.StatusPolicyViolation
			closeReason = "peer already registered"
		}
		_ = conn.Close(status, closeReason)
		return
	}

	client.run(r.Context())
}
