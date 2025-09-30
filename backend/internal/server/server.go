package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/uoxou-moe/rabbit-rtc/backend/internal/signaling"
)

const (
	healthzPath       = "/healthz"
	signalingPath     = "/ws"
	allowedOriginsEnv = "SIGNALING_ALLOWED_ORIGINS"
)

var serverStart = time.Now()

type HandlerConfig struct {
	Logger *slog.Logger
}

func NewHandler(cfg HandlerConfig) http.Handler {
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	httpLogger := logger.With("component", "http")
	mux := http.NewServeMux()
	mux.HandleFunc(healthzPath, healthHandler(httpLogger))

	configLogger := logger.With("component", "config")
	hub := signaling.NewHub(signaling.HubConfig{
		AllowedOrigins: signalingAllowedOrigins(configLogger),
		Logger:         logger,
	})
	mux.HandleFunc(signalingPath, hub.ServeWS)
	return mux
}

type healthResponse struct {
	Status string `json:"status"`
	Uptime string `json:"uptime"`
}

func healthHandler(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			logger.Warn("healthz invalid method", "method", r.Method, "remote", r.RemoteAddr)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		resp := healthResponse{
			Status: "ok",
			Uptime: time.Since(serverStart).Round(time.Second).String(),
		}

		if err := json.NewEncoder(w).Encode(resp); err != nil {
			logger.Error("failed to encode health response", "err", err)
			http.Error(w, "failed to encode response", http.StatusInternalServerError)
			return
		}

		logger.Debug("healthz responded", "remote", r.RemoteAddr)
	}
}

func signalingAllowedOrigins(logger *slog.Logger) []string {
	raw := strings.TrimSpace(os.Getenv(allowedOriginsEnv))
	if raw == "" {
		logger.Debug("no signaling origins configured; using defaults")
		return nil
	}

	parts := strings.Split(raw, ",")
	var origins []string
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		origins = append(origins, trimmed)
	}

	if len(origins) > 0 {
		logger.Debug("configured signaling allowed origins", "origins", origins)
	}

	return origins
}
