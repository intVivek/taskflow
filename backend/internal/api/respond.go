package api

import (
	"encoding/json"
	"net/http"
)

type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type errEnvelope struct {
	Error apiError `json:"error"`
}

type listMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

type listEnvelope struct {
	Data any      `json:"data"`
	Meta listMeta `json:"meta"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, errEnvelope{Error: apiError{Code: code, Message: msg}})
}

func writeValidationError(w http.ResponseWriter, fields map[string]string) {
	writeJSON(w, http.StatusUnprocessableEntity, errEnvelope{Error: apiError{
		Code: "validation_failed", Message: "validation failed", Fields: fields,
	}})
}
