package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type health struct {
	Status string `json:"status"`
}

func TestHealthzEndpoint(t *testing.T) {
	handler := NewHandler()

	req := httptest.NewRequest(http.MethodGet, healthzPath, nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if got := res.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected application/json content type, got %s", got)
	}

	var payload health
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if payload.Status != "ok" {
		t.Fatalf("expected status 'ok', got %q", payload.Status)
	}
}

func TestHealthzMethodNotAllowed(t *testing.T) {
	handler := NewHandler()

	req := httptest.NewRequest(http.MethodPost, healthzPath, nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status %d, got %d", http.StatusMethodNotAllowed, res.Code)
	}
}
