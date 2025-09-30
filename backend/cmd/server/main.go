package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/uoxou-moe/rabbit-rtc/backend/internal/logging"
	"github.com/uoxou-moe/rabbit-rtc/backend/internal/server"
)

const defaultAddr = ":8080"

func main() {
	bootstrapLogger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	loadEnv(bootstrapLogger)

	baseLogger := logging.Setup(logging.Options{
		Level:     os.Getenv("LOG_LEVEL"),
		Format:    os.Getenv("LOG_FORMAT"),
		AddSource: envBool("LOG_ADD_SOURCE"),
	}).With("service", "rabbit-rtc")
	logger := baseLogger.With("component", "server")

	addr := resolveAddr()

	srv := &http.Server{
		Addr:              addr,
		Handler:           server.NewHandler(server.HandlerConfig{Logger: baseLogger}),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("HTTP server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server listen failed", "err", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "err", err)
	}

	logger.Info("server stopped")
}

func loadEnv(logger *slog.Logger) {
	candidates := []string{"../.env", ".env"}
	for _, path := range candidates {
		values, err := godotenv.Read(path)
		if err != nil {
			if os.IsNotExist(err) {
				logger.Debug("env file not found", "path", path)
				continue
			}
			logger.Warn("failed to load env file", "path", path, "err", err)
			continue
		}

		for key, value := range values {
			if _, exists := os.LookupEnv(key); exists {
				logger.Debug("env already defined, skipping", "key", key)
				continue
			}
			if err := os.Setenv(key, value); err != nil {
				logger.Warn("failed to set env from file", "key", key, "path", path, "err", err)
			}
		}

		logger.Info("loaded environment variables from file", "path", path)
		return
	}

	logger.Debug("no env file applied")
}

func resolveAddr() string {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		return defaultAddr
	}

	if strings.HasPrefix(port, ":") {
		return port
	}

	return ":" + port
}

func envBool(key string) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return false
	}

	switch strings.ToLower(value) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	default:
		return false
	}
}
