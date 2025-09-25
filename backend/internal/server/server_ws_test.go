package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

func TestWebSocketRequiresQueryParams(t *testing.T) {
	h := NewHandler()

	req := httptest.NewRequest(http.MethodGet, signalingPath, nil)
	res := httptest.NewRecorder()

	h.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, res.Code)
	}
}

func TestWebSocketRejectsNonGet(t *testing.T) {
	h := NewHandler()

	req := httptest.NewRequest(http.MethodPost, signalingPath+"?room=test&peer=alice", nil)
	res := httptest.NewRecorder()

	h.ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected %d, got %d", http.StatusMethodNotAllowed, res.Code)
	}
}

func TestWebSocketSignalRouting(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	t.Cleanup(srv.Close)

	alice := dialWebSocket(t, srv.URL, "room1", "alice")
	defer alice.Close(websocket.StatusNormalClosure, "bye")

	bob := dialWebSocket(t, srv.URL, "room1", "bob")
	defer bob.Close(websocket.StatusNormalClosure, "bye")

	payload := map[string]string{"sdp": "dummy-offer"}
	msg := map[string]interface{}{
		"type":    "offer",
		"to":      "bob",
		"payload": payload,
	}

	writeJSON(t, alice, msg)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, data, err := bob.Read(ctx)
	if err != nil {
		t.Fatalf("bob failed to read message: %v", err)
	}

	var received map[string]interface{}
	if err := json.Unmarshal(data, &received); err != nil {
		t.Fatalf("invalid json: %v", err)
	}

	if received["type"] != "offer" {
		t.Fatalf("expected type offer, got %v", received["type"])
	}

	if received["from"] != "alice" {
		t.Fatalf("expected from alice, got %v", received["from"])
	}

	if received["to"] != "bob" {
		t.Fatalf("expected to bob, got %v", received["to"])
	}
}

func TestWebSocketUnknownTargetSendsError(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	t.Cleanup(srv.Close)

	alice := dialWebSocket(t, srv.URL, "room1", "alice")
	defer alice.Close(websocket.StatusNormalClosure, "bye")

	msg := map[string]interface{}{
		"type": "offer",
		"to":   "carol",
	}

	writeJSON(t, alice, msg)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, data, err := alice.Read(ctx)
	if err != nil {
		t.Fatalf("alice failed to read error: %v", err)
	}

	var received map[string]interface{}
	if err := json.Unmarshal(data, &received); err != nil {
		t.Fatalf("invalid json: %v", err)
	}

	if received["type"] != "error" {
		t.Fatalf("expected error message, got type %v", received["type"])
	}
}

func dialWebSocket(t *testing.T, baseURL, room, peer string) *websocket.Conn {
	t.Helper()

	u, err := url.Parse(baseURL)
	if err != nil {
		t.Fatalf("invalid url: %v", err)
	}

	u.Scheme = "ws"
	u.Path = signalingPath

	q := u.Query()
	q.Set("room", room)
	q.Set("peer", peer)
	u.RawQuery = q.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, u.String(), nil)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}

	return conn
}

func writeJSON(t *testing.T, conn *websocket.Conn, msg interface{}) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := conn.Write(ctx, websocket.MessageText, mustJSON(t, msg)); err != nil {
		t.Fatalf("failed to write message: %v", err)
	}
}

func mustJSON(t *testing.T, v interface{}) []byte {
	t.Helper()

	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}
	return data
}
