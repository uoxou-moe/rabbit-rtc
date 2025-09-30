# syntax=docker/dockerfile:1.5

FROM golang:1.22 AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /out/server ./cmd/server

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app

COPY --from=builder /out/server ./server

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["./server"]
