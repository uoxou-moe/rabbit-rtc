package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"nhooyr.io/websocket"
)

const (
	writeTimeout    = 5 * time.Second
	maxMessageBytes = 1 << 20 // 1 MiB
	queueSize       = 16
)

// Client keeps the WebSocket connection for a peer.
type Client struct {
	hub    *Hub
	roomID string
	peerID string
	conn   *websocket.Conn
	logger *slog.Logger
	send   chan []byte
}

func newClient(hub *Hub, roomID, peerID string, conn *websocket.Conn) *Client {
	return &Client{
		hub:    hub,
		roomID: roomID,
		peerID: peerID,
		conn:   conn,
		logger: hub.logger.With("room", roomID, "peer", peerID),
		send:   make(chan []byte, queueSize),
	}
}

// run starts the read/write loops for the client.
func (c *Client) run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	c.conn.SetReadLimit(maxMessageBytes)

	go c.writeLoop(ctx)
	c.readLoop(ctx)
}

func (c *Client) readLoop(ctx context.Context) {
	defer func() {
		c.hub.unregister(ctx, c)
		close(c.send)
		_ = c.conn.Close(websocket.StatusNormalClosure, "closing")
	}()

	for {
		msgType, data, err := c.conn.Read(ctx)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				c.logger.DebugContext(ctx, "read loop ended", "err", err)
			}
			return
		}

		if msgType != websocket.MessageText {
			c.sendError("only text messages are supported")
			continue
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			c.sendError("invalid message format")
			continue
		}

		if msg.Type == "" {
			c.sendError("message type is required")
			continue
		}

		c.hub.dispatch(ctx, c, msg)
	}
}

func (c *Client) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-c.send:
			if !ok {
				return
			}

			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(writeCtx, websocket.MessageText, data)
			cancel()
			if err != nil {
				c.logger.DebugContext(ctx, "write failed", "err", err)
				return
			}
		}
	}
}

func (c *Client) enqueue(data []byte) {
	// duplicate the slice as it might be reused by callers
	copyBuf := make([]byte, len(data))
	copy(copyBuf, data)

	select {
	case c.send <- copyBuf:
	default:
		c.logger.Warn("dropping message: send queue full")
	}
}

func (c *Client) formatMessage(msg Message) ([]byte, error) {
	msg.From = c.peerID
	return json.Marshal(msg)
}

func (c *Client) sendError(msg string) {
	c.logger.Warn("sending error", "message", msg)
	c.enqueue(newErrorPayload(msg))
}
