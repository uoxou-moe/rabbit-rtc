GO ?= go
GOFMT ?= gofmt
GOFILES := $(shell find backend -name '*.go' -not -path '*/vendor/*')

.PHONY: backend/run backend/build backend/test backend/fmt backend/lint

backend/run:
	cd backend && $(GO) run ./cmd/server

backend/build:
	cd backend && $(GO) build ./cmd/server

backend/test:
	cd backend && $(GO) test ./...

backend/fmt:
	$(GOFMT) -w $(GOFILES)

backend/lint:
	@unformatted=$(shell $(GOFMT) -l $(GOFILES)); \
	if [ -n "$$unformatted" ]; then \
		echo "gofmt needed on:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi
