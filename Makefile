GO ?= go

.PHONY: backend/run backend/build backend/test

backend/run:
	cd backend && $(GO) run ./cmd/server

backend/build:
	cd backend && $(GO) build ./cmd/server

backend/test:
	cd backend && $(GO) test ./...
