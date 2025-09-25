package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/uoxou-moe/rabbit-rtc/backend/internal/signaling"
)

const healthzPath = "/healthz"
const signalingPath = "/ws"

var serverStart = time.Now()

// NewHandler returns the HTTP handler configured for the application.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(healthzPath, healthHandler)

	hub := signaling.NewHub(nil)
	mux.HandleFunc(signalingPath, hub.ServeWS)
	return mux
}

type healthResponse struct {
	Status string `json:"status"`
	Uptime string `json:"uptime"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	resp := healthResponse{
		Status: "ok",
		Uptime: time.Since(serverStart).Round(time.Second).String(),
	}

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}
