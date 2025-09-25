package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeTimeout    = 5 * time.Second
	maxMessageBytes = 1 << 20 // 1 MiB
	queueSize       = 16
)

// Client keeps the WebSocket connection for a peer.
type Client struct {
	hub       *Hub
	roomID    string
	peerID    string
	conn      *websocket.Conn
	logger    *slog.Logger
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

func newClient(hub *Hub, roomID, peerID string, conn *websocket.Conn) *Client {
	return &Client{
		hub:    hub,
		roomID: roomID,
		peerID: peerID,
		conn:   conn,
		logger: hub.logger.With("room", roomID, "peer", peerID),
		send:   make(chan []byte, queueSize),
		done:   make(chan struct{}),
	}
}

// run starts the read/write loops for the client.
func (c *Client) run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	c.conn.SetReadLimit(maxMessageBytes)

	go func() {
		<-ctx.Done()
		_ = c.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "context canceled"),
			time.Now().Add(writeTimeout),
		)
		_ = c.conn.Close()
		c.shutdown()
	}()

	go c.writeLoop(ctx)
	c.readLoop(ctx)
}

func (c *Client) readLoop(ctx context.Context) {
	defer func() {
		c.shutdown()
		c.hub.unregister(ctx, c)
		_ = c.conn.Close()
	}()

	for {
		msgType, data, err := c.conn.ReadMessage()
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				c.logger.DebugContext(ctx, "read loop ended", "err", err)
			}
			return
		}

		if msgType != websocket.TextMessage {
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

		c.logger.DebugContext(ctx, "inbound message", "type", msg.Type, "to", msg.To)
		c.hub.dispatch(ctx, c, msg)
	}
}

func (c *Client) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		default:
		}

		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case data := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				c.logger.DebugContext(ctx, "failed to set write deadline", "err", err)
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				c.logger.DebugContext(ctx, "write failed", "err", err)
				return
			}
			c.logger.DebugContext(ctx, "outbound message sent")
		}
	}
}

func (c *Client) enqueue(data []byte) {
	select {
	case <-c.done:
		return
	default:
	}

	// duplicate the slice as it might be reused by callers
	copyBuf := make([]byte, len(data))
	copy(copyBuf, data)

	select {
	case <-c.done:
		return
	case c.send <- copyBuf:
		return
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

func (c *Client) shutdown() {
	c.closeOnce.Do(func() {
		close(c.done)
	})
}
