package signaling

import "encoding/json"

// Message represents the signaling payload exchanged between peers.
type Message struct {
	Type    string          `json:"type"`
	To      string          `json:"to,omitempty"`
	From    string          `json:"from,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// ErrorPayload is sent to the client when the hub rejects a message.
type ErrorPayload struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func newErrorPayload(msg string) []byte {
	payload, _ := json.Marshal(ErrorPayload{
		Type:    "error",
		Message: msg,
	})
	return payload
}
