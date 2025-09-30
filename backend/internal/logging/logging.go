package logging

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

type Options struct {
	Level     string
	Format    string
	AddSource bool
	Output    io.Writer
}

func Setup(opts Options) *slog.Logger {
	handlerOptions := &slog.HandlerOptions{
		Level:     parseLevel(opts.Level),
		AddSource: opts.AddSource,
	}

	writer := opts.Output
	if writer == nil {
		writer = os.Stdout
	}

	var handler slog.Handler
	switch strings.ToLower(strings.TrimSpace(opts.Format)) {
	case "json":
		handler = slog.NewJSONHandler(writer, handlerOptions)
	default:
		handler = slog.NewTextHandler(writer, handlerOptions)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

func parseLevel(level string) *slog.LevelVar {
	lvl := new(slog.LevelVar)
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lvl.Set(slog.LevelDebug)
	case "warn":
		lvl.Set(slog.LevelWarn)
	case "error":
		lvl.Set(slog.LevelError)
	case "info", "":
		fallthrough
	default:
		lvl.Set(slog.LevelInfo)
	}
	return lvl
}
