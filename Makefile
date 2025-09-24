GO ?= go
GOFMT ?= gofmt
NPM ?= npm
GOFIND := find backend -name '*.go' -not -path '*/vendor/*'

.PHONY: install dev build test lint lint-fix format format-fix help \
	frontend/install frontend/dev frontend/build frontend/lint frontend/lint-fix \
	frontend/format frontend/format-fix frontend/test \
	backend/run backend/build backend/test backend/fmt backend/lint

install: frontend/install

dev: frontend/dev

build: frontend/build backend/build

test: frontend/test backend/test

lint: frontend/lint backend/lint

lint-fix: frontend/lint-fix backend/fmt

format: frontend/format backend/lint

format-fix: frontend/format-fix backend/fmt

help:
	@echo "Available targets:"
	@echo "  make install        # npm install in frontend"
	@echo "  make dev            # run frontend dev server"
	@echo "  make build          # build frontend and backend"
	@echo "  make test           # run frontend (if available) and backend tests"
	@echo "  make lint           # run ESLint and gofmt checks"
	@echo "  make format         # run Prettier check and gofmt check"
	@echo "  make lint-fix       # fix lint issues (frontend) and gofmt format"
	@echo "  make format-fix     # run Prettier write and gofmt format"
	@echo "  make backend/run    # start Go server"
	@echo "  make backend/build  # build Go server"
	@echo "  make backend/test   # run Go tests"
	@echo "  make backend/fmt    # apply gofmt to backend"
	@echo "  make backend/lint   # check gofmt formatting"
	@echo "  make frontend/...   # npm scripts for frontend"

frontend/install:
	cd frontend && $(NPM) install

frontend/dev:
	cd frontend && $(NPM) run dev

frontend/build:
	cd frontend && $(NPM) run build

frontend/lint:
	cd frontend && $(NPM) run lint

frontend/lint-fix:
	cd frontend && $(NPM) run lint:fix

frontend/format:
	cd frontend && $(NPM) run format

frontend/format-fix:
	cd frontend && $(NPM) run format:fix

frontend/test:
	cd frontend && $(NPM) run test --if-present

backend/run:
	cd backend && $(GO) run ./cmd/server

backend/build:
	cd backend && $(GO) build ./cmd/server

backend/test:
	cd backend && $(GO) test ./...

backend/fmt:
	@files="$$($(GOFIND))"; \
	if [ -z "$$files" ]; then \
		echo "No Go files to format."; \
		exit 0; \
	fi; \
	$(GOFMT) -w $$files

backend/lint:
	@files="$$($(GOFIND))"; \
	if [ -z "$$files" ]; then \
		echo "No Go files to lint."; \
		exit 0; \
	fi; \
	unformatted="$$($(GOFMT) -l $$files)"; \
	if [ -n "$$unformatted" ]; then \
		echo "gofmt needed on:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi
