package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketRequiresQueryParams(t *testing.T) {
	t.Setenv(allowedOriginsEnv, "")
	h := NewHandler(HandlerConfig{Logger: newTestLogger()})

	req := httptest.NewRequest(http.MethodGet, signalingPath, nil)
	res := httptest.NewRecorder()

	h.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, res.Code)
	}
}

func TestWebSocketRejectsNonGet(t *testing.T) {
	t.Setenv(allowedOriginsEnv, "")
	h := NewHandler(HandlerConfig{Logger: newTestLogger()})

	req := httptest.NewRequest(http.MethodPost, signalingPath+"?room=test&peer=alice", nil)
	res := httptest.NewRecorder()

	h.ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected %d, got %d", http.StatusMethodNotAllowed, res.Code)
	}
}

func TestWebSocketSignalRouting(t *testing.T) {
	t.Setenv(allowedOriginsEnv, "")
	srv := httptest.NewServer(NewHandler(HandlerConfig{Logger: newTestLogger()}))
	t.Cleanup(srv.Close)

	alice := dialWebSocket(t, srv.URL, "room1", "alice")
	defer closeConn(t, alice)

	bob := dialWebSocket(t, srv.URL, "room1", "bob")
	defer closeConn(t, bob)

	payload := map[string]string{"sdp": "dummy-offer"}
	msg := map[string]interface{}{
		"type":    "offer",
		"to":      "bob",
		"payload": payload,
	}

	writeJSON(t, alice, msg)

	if err := bob.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("failed to set read deadline: %v", err)
	}

	msgType, data, err := bob.ReadMessage()
	if err != nil {
		t.Fatalf("bob failed to read message: %v", err)
	}

	if msgType != websocket.TextMessage {
		t.Fatalf("expected text message, got %d", msgType)
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
	t.Setenv(allowedOriginsEnv, "")
	srv := httptest.NewServer(NewHandler(HandlerConfig{Logger: newTestLogger()}))
	t.Cleanup(srv.Close)

	alice := dialWebSocket(t, srv.URL, "room1", "alice")
	defer closeConn(t, alice)

	msg := map[string]interface{}{
		"type": "offer",
		"to":   "carol",
	}

	writeJSON(t, alice, msg)

	if err := alice.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("failed to set read deadline: %v", err)
	}

	msgType, data, err := alice.ReadMessage()
	if err != nil {
		t.Fatalf("alice failed to read error: %v", err)
	}

	if msgType != websocket.TextMessage {
		t.Fatalf("expected text message, got %d", msgType)
	}

	var received map[string]interface{}
	if err := json.Unmarshal(data, &received); err != nil {
		t.Fatalf("invalid json: %v", err)
	}

	if received["type"] != "error" {
		t.Fatalf("expected error message, got type %v", received["type"])
	}
}

func TestWebSocketDispatchDuringDisconnectDoesNotPanic(t *testing.T) {
	t.Setenv(allowedOriginsEnv, "")
	srv := httptest.NewServer(NewHandler(HandlerConfig{Logger: newTestLogger()}))
	t.Cleanup(srv.Close)

	alice := dialWebSocket(t, srv.URL, "race-room", "alice")
	t.Cleanup(func() { closeConn(t, alice) })

	bob := dialWebSocket(t, srv.URL, "race-room", "bob")

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 100; i++ {
			msg := map[string]interface{}{
				"type":    "offer",
				"to":      "bob",
				"payload": map[string]int{"seq": i},
			}
			writeJSON(t, alice, msg)
		}
	}()

	// allow some messages to be inflight before disconnecting bob
	time.Sleep(20 * time.Millisecond)
	closeConn(t, bob)

	wg.Wait()

	// give the hub a brief moment to process any remaining dispatches
	time.Sleep(50 * time.Millisecond)
}

func TestWebSocketRejectsDisallowedOrigin(t *testing.T) {
	t.Setenv(allowedOriginsEnv, "https://allowed.example")
	srv := httptest.NewServer(NewHandler(HandlerConfig{Logger: newTestLogger()}))
	t.Cleanup(srv.Close)

	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatalf("failed to parse server url: %v", err)
	}

	u.Scheme = "ws"
	u.Path = signalingPath
	q := u.Query()
	q.Set("room", "room1")
	q.Set("peer", "alice")
	u.RawQuery = q.Encode()

	dialer := websocket.Dialer{}
	header := http.Header{}
	header.Set("Origin", "https://not-allowed.example")

	_, _, err = dialer.Dial(u.String(), header)
	if err == nil {
		t.Fatalf("expected handshake error for disallowed origin")
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

	dialCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	header := http.Header{}
	header.Set("Origin", "http://127.0.0.1")
	conn, _, err := websocket.DefaultDialer.DialContext(dialCtx, u.String(), header)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}

	return conn
}

func writeJSON(t *testing.T, conn *websocket.Conn, msg interface{}) {
	t.Helper()

	if err := conn.SetWriteDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("failed to set write deadline: %v", err)
	}

	if err := conn.WriteMessage(websocket.TextMessage, mustJSON(t, msg)); err != nil {
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

func closeConn(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	_ = conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "test done"),
		time.Now().Add(time.Second),
	)
	_ = conn.Close()
}
