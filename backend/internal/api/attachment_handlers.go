package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"taskflow/internal/store"
)

const (
	maxUploadBytes = 6 << 20 // 6 MB http body limit (multipart overhead)
	maxFileBytes   = 5 << 20 // 5 MB file limit
)

// attachmentDTO is the wire shape for attachment metadata (never includes data).
type attachmentDTO struct {
	ID          uuid.UUID `json:"id"`
	TaskID      uuid.UUID `json:"task_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int32     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

func toAttachmentDTO(row store.InsertAttachmentRow) attachmentDTO {
	return attachmentDTO{
		ID:          row.ID,
		TaskID:      row.TaskID,
		Filename:    row.Filename,
		ContentType: row.ContentType,
		SizeBytes:   row.SizeBytes,
		CreatedAt:   row.CreatedAt,
	}
}

func listRowToDTO(row store.ListAttachmentsForTaskRow) attachmentDTO {
	return attachmentDTO{
		ID:          row.ID,
		TaskID:      row.TaskID,
		Filename:    row.Filename,
		ContentType: row.ContentType,
		SizeBytes:   row.SizeBytes,
		CreatedAt:   row.CreatedAt,
	}
}

// allowedContentTypes is the set of accepted MIME types.
var allowedContentTypes = map[string]bool{
	"image/png":       true,
	"image/jpeg":      true,
	"image/gif":       true,
	"image/webp":      true,
	"application/pdf": true,
	// "text/plain" is matched by prefix below.
}

func isAllowedContentType(ct string) bool {
	if allowedContentTypes[ct] {
		return true
	}
	// DetectContentType returns "text/plain; charset=utf-8" for text files.
	if strings.HasPrefix(ct, "text/plain") {
		return true
	}
	return false
}

// sanitizeFilename strips path components, caps at 255 runes, and falls back
// to "upload" if the result is empty.
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	if name == "." || name == "/" {
		return "upload"
	}
	runes := []rune(name)
	if len(runes) > 255 {
		name = string(runes[:255])
	}
	if utf8.RuneCountInString(name) == 0 {
		return "upload"
	}
	return name
}

// attachmentID parses the {id} path segment; writes 404 on malformed UUIDs.
func attachmentID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "attachment not found")
		return uuid.Nil, false
	}
	return id, true
}

// handleUploadAttachment handles POST /tasks/{id}/attachments.
// Owner-only (admins cannot upload to others' tasks).
func (s *Server) handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	tid, ok := taskID(w, r)
	if !ok {
		return
	}

	// Verify task ownership (owner only, no admin bypass).
	task, err := s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: tid, UserID: claims.UserID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load task")
		return
	}

	// Apply a 6 MB body cap to catch oversized requests before multipart parsing.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		// MaxBytesReader causes a "http: request body too large" error on excess.
		writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "file too large (max 5 MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		// Missing "file" field.
		writeValidationError(w, map[string]string{"file": "is required"})
		return
	}
	defer file.Close()

	// Read file bytes (bounded by our earlier MaxBytesReader).
	data := make([]byte, 0, header.Size)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := file.Read(buf)
		if n > 0 {
			data = append(data, buf[:n]...)
		}
		if readErr != nil {
			break
		}
	}

	// Enforce 5 MB file size limit (size check fires before type check).
	if len(data) > maxFileBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "file too large (max 5 MB)")
		return
	}

	// Sniff content type from the first 512 bytes.
	sniff := data
	if len(sniff) > 512 {
		sniff = sniff[:512]
	}
	detectedCT := http.DetectContentType(sniff)
	// Strip parameters for storage (e.g. "text/plain; charset=utf-8" → "text/plain").
	storedCT, _, _ := mime.ParseMediaType(detectedCT)
	if storedCT == "" {
		storedCT = detectedCT
	}

	if !isAllowedContentType(detectedCT) {
		writeValidationError(w, map[string]string{"file": "unsupported file type"})
		return
	}

	filename := sanitizeFilename(header.Filename)

	// Build changes JSON for activity.
	changesJSON, _ := json.Marshal(map[string]map[string]any{
		"filename": {"from": nil, "to": filename},
	})

	var inserted store.InsertAttachmentRow
	err = s.st.InTx(r.Context(), func(q *store.Queries) error {
		var txErr error
		inserted, txErr = q.InsertAttachment(r.Context(), store.InsertAttachmentParams{
			TaskID:      tid,
			Filename:    filename,
			ContentType: storedCT,
			SizeBytes:   int32(len(data)),
			Data:        data,
		})
		if txErr != nil {
			return txErr
		}
		return q.InsertActivity(r.Context(), store.InsertActivityParams{
			TaskID:  tid,
			ActorID: pgtype.UUID{Bytes: claims.UserID, Valid: true},
			Action:  "attachment_added",
			Changes: changesJSON,
		})
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not save attachment")
		return
	}

	dto := toAttachmentDTO(inserted)
	writeJSON(w, http.StatusCreated, dto)

	// Publish task.updated event with current task DTO.
	taskDTO := toDTO(task)
	publishTaskEvent(s, claims.UserID, "task.updated", &taskDTO, tid)
}

// handleListAttachments handles GET /tasks/{id}/attachments.
// Owner or admin may list.
func (s *Server) handleListAttachments(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	tid, ok := taskID(w, r)
	if !ok {
		return
	}

	// Verify access: admin may view any task; regular users must own it.
	if claims.Role == "admin" {
		_, err := s.st.GetTask(r.Context(), tid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "not_found", "task not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal", "could not load task")
			return
		}
	} else {
		_, err := s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: tid, UserID: claims.UserID})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "not_found", "task not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal", "could not load task")
			return
		}
	}

	rows, err := s.st.ListAttachmentsForTask(r.Context(), tid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list attachments")
		return
	}

	dtos := make([]attachmentDTO, len(rows))
	for i, row := range rows {
		dtos[i] = listRowToDTO(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": dtos})
}

// handleDownloadAttachment handles GET /attachments/{id}.
// Owner or admin may download.
func (s *Server) handleDownloadAttachment(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	aid, ok := attachmentID(w, r)
	if !ok {
		return
	}

	row, err := s.st.GetAttachmentWithOwner(r.Context(), aid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "attachment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load attachment")
		return
	}

	// Access check: owner or admin.
	if row.OwnerID != claims.UserID && claims.Role != "admin" {
		writeError(w, http.StatusNotFound, "not_found", "attachment not found")
		return
	}

	// Build a safe Content-Disposition header.
	disposition := mime.FormatMediaType("inline", map[string]string{"filename": row.Filename})
	if disposition == "" {
		// Fallback if FormatMediaType fails (e.g. control chars in filename).
		disposition = fmt.Sprintf(`inline; filename="upload"`)
	}

	w.Header().Set("Content-Type", row.ContentType)
	w.Header().Set("Content-Disposition", disposition)
	w.Header().Set("Content-Length", strconv.Itoa(len(row.Data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(row.Data)
}

// handleDeleteAttachment handles DELETE /attachments/{id}.
// Owner only.
func (s *Server) handleDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	aid, ok := attachmentID(w, r)
	if !ok {
		return
	}

	row, err := s.st.GetAttachmentWithOwner(r.Context(), aid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "attachment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load attachment")
		return
	}

	// Owner-only: admins cannot delete others' attachments.
	if row.OwnerID != claims.UserID {
		writeError(w, http.StatusNotFound, "not_found", "attachment not found")
		return
	}

	// Build changes JSON for activity.
	changesJSON, _ := json.Marshal(map[string]map[string]any{
		"filename": {"from": row.Filename, "to": nil},
	})

	err = s.st.InTx(r.Context(), func(q *store.Queries) error {
		n, txErr := q.DeleteAttachment(r.Context(), aid)
		if txErr != nil {
			return txErr
		}
		if n == 0 {
			return pgx.ErrNoRows
		}
		return q.InsertActivity(r.Context(), store.InsertActivityParams{
			TaskID:  row.TaskID,
			ActorID: pgtype.UUID{Bytes: claims.UserID, Valid: true},
			Action:  "attachment_removed",
			Changes: changesJSON,
		})
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "attachment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not delete attachment")
		return
	}

	w.WriteHeader(http.StatusNoContent)

	// Publish task.updated event.
	if task, taskErr := s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: row.TaskID, UserID: claims.UserID}); taskErr == nil {
		dto := toDTO(task)
		publishTaskEvent(s, claims.UserID, "task.updated", &dto, row.TaskID)
	}
}
