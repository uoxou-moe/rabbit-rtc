package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/uoxou-moe/rabbit-rtc/backend/internal/server"
)

const defaultAddr = ":8080"

func main() {
	loadEnv()

	addr := resolveAddr()

	srv := &http.Server{
		Addr:              addr,
		Handler:           server.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("HTTP server listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server listen failed: %v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	<-ctx.Done()
	log.Println("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}

	log.Println("server stopped")
}

func loadEnv() {
	candidates := []string{"../.env", ".env"}
	for _, path := range candidates {
		values, err := godotenv.Read(path)
		if err != nil {
			if !os.IsNotExist(err) {
				log.Printf("failed to load env file %s: %v", path, err)
			}
			continue
		}
		for key, value := range values {
			if _, exists := os.LookupEnv(key); exists {
				continue
			}
			if err := os.Setenv(key, value); err != nil {
				log.Printf("failed to set env %s from %s: %v", key, path, err)
			}
		}
		log.Printf("loaded environment variables from %s", path)
		return
	}
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
