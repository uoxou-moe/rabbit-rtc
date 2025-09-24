GO ?= go
GOFMT ?= gofmt
GOFIND := find backend -name '*.go' -not -path '*/vendor/*'

.PHONY: backend/run backend/build backend/test backend/fmt backend/lint

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
