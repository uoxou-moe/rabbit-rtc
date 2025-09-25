package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	endpoint := flag.String("url", "ws://localhost:8080/ws", "WebSocket endpoint URL")
	room := flag.String("room", "", "room identifier")
	peer := flag.String("peer", "", "peer identifier")
	flag.Parse()

	if strings.TrimSpace(*room) == "" || strings.TrimSpace(*peer) == "" {
		log.Fatal("room and peer flags are required")
	}

	u, err := url.Parse(*endpoint)
	if err != nil {
		log.Fatalf("invalid url: %v", err)
	}

	q := u.Query()
	q.Set("room", *room)
	q.Set("peer", *peer)
	u.RawQuery = q.Encode()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	conn, _, err := websocket.DefaultDialer.DialContext(dialCtx, u.String(), nil)
	cancel()
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
	}
	defer func() {
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "client done"),
			time.Now().Add(time.Second),
		)
		conn.Close()
	}()

	fmt.Printf("connected to %s\n", u.String())
	fmt.Println("Enter JSON messages to send. Submit an empty line to exit.")

	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for {
			if err := conn.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil {
				fmt.Printf("failed to set read deadline: %v\n", err)
				return
			}

			msgType, data, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					fmt.Println("connection closed")
				} else {
					fmt.Printf("read error: %v\n", err)
				}
				return
			}

			if msgType != websocket.TextMessage {
				continue
			}

			fmt.Printf("<- %s\n", string(data))
		}
	}()

	go func() {
		<-ctx.Done()
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "interrupt"),
			time.Now().Add(time.Second),
		)
		conn.Close()
	}()

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("-> ")
		if !scanner.Scan() {
			break
		}

		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			break
		}

		if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
			fmt.Printf("failed to set write deadline: %v\n", err)
			break
		}

		if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
			fmt.Printf("write error: %v\n", err)
			break
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Printf("stdin error: %v\n", err)
	}

	stop()
	<-readDone
}
