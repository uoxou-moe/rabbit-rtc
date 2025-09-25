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

	"nhooyr.io/websocket"
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

	conn, _, err := websocket.Dial(ctx, u.String(), nil)
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "client done")

	fmt.Printf("connected to %s\n", u.String())
	fmt.Println("Enter JSON messages to send. Submit an empty line to exit.")

	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for {
			msgType, data, err := conn.Read(ctx)
			if err != nil {
				status := websocket.CloseStatus(err)
				if status == websocket.StatusNormalClosure {
					fmt.Println("connection closed by server")
				} else {
					fmt.Printf("read error: %v\n", err)
				}
				return
			}

			if msgType != websocket.MessageText {
				continue
			}

			fmt.Printf("<- %s\n", string(data))
		}
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

		writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := conn.Write(writeCtx, websocket.MessageText, []byte(line))
		cancel()
		if err != nil {
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
