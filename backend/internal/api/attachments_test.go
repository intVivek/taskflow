package api_test

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
	"time"
)

// attachmentMeta is the wire shape for attachment metadata (no data field).
type attachmentMeta struct {
	ID          string    `json:"id"`
	TaskID      string    `json:"task_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int       `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

type attachmentListResp struct {
	Data []attachmentMeta `json:"data"`
}

// minimalPNG is a 1x1 PNG, base64-encoded.
const minimalPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func minimalPNGBytes(t *testing.T) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(minimalPNGBase64)
	if err != nil {
		t.Fatalf("decode minimalPNG: %v", err)
	}
	return b
}

// doMultipart builds and sends a multipart/form-data request.
// fields is a map of field name → (filename, content-type, bytes).
// Pass filename="" to add a plain text field instead of a file part.
func doMultipartUpload(t *testing.T, path string, cookie *http.Cookie, filename, ct string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Build the file part with explicit Content-Type.
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition",
		`form-data; name="file"; filename="`+filename+`"`)
	h.Set("Content-Type", ct)
	pw, err := mw.CreatePart(h)
	if err != nil {
		t.Fatalf("create part: %v", err)
	}
	if _, err := pw.Write(data); err != nil {
		t.Fatalf("write part: %v", err)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	testHandler.ServeHTTP(rec, req)
	return rec
}

// doMultipartNoFile sends a multipart request with no "file" part (only a dummy text field).
func doMultipartNoFile(t *testing.T, path string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("other", "irrelevant")
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	testHandler.ServeHTTP(rec, req)
	return rec
}

// TestAttachmentRoundtrip: full lifecycle — upload, list, download, delete.
func TestAttachmentRoundtrip(t *testing.T) {
	resetDB(t)
	c := signup(t, "attach_round@example.com")
	tk := createTask(t, c, map[string]any{"title": "roundtrip task"})

	pngBytes := minimalPNGBytes(t)

	// Upload.
	rec := doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", c, "test.png", "image/png", pngBytes)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var meta attachmentMeta
	decode(t, rec, &meta)
	if meta.ContentType != "image/png" {
		t.Fatalf("content_type: want image/png, got %q", meta.ContentType)
	}
	if meta.SizeBytes != len(pngBytes) {
		t.Fatalf("size_bytes: want %d, got %d", len(pngBytes), meta.SizeBytes)
	}
	if meta.Filename != "test.png" {
		t.Fatalf("filename: want test.png, got %q", meta.Filename)
	}
	if meta.TaskID != tk.ID {
		t.Fatalf("task_id: want %q, got %q", tk.ID, meta.TaskID)
	}
	if meta.ID == "" {
		t.Fatal("id: must be non-empty")
	}

	// List — should have exactly 1 entry.
	rec = doReq(t, "GET", "/tasks/"+tk.ID+"/attachments", nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var listResp attachmentListResp
	decode(t, rec, &listResp)
	if len(listResp.Data) != 1 {
		t.Fatalf("list: want 1 item, got %d", len(listResp.Data))
	}
	if listResp.Data[0].ID != meta.ID {
		t.Fatalf("list item id mismatch: want %q, got %q", meta.ID, listResp.Data[0].ID)
	}

	// Download — bytes must match and headers must be set correctly.
	rec = doReq(t, "GET", "/attachments/"+meta.ID, nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("download: want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	got, _ := io.ReadAll(rec.Body)
	if !bytes.Equal(got, pngBytes) {
		t.Fatalf("download: bytes mismatch (len got=%d want=%d)", len(got), len(pngBytes))
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("Content-Type: want image/png, got %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); cd == "" {
		t.Fatal("Content-Disposition must be set")
	}
	if cl := rec.Header().Get("Content-Length"); cl == "" {
		t.Fatal("Content-Length must be set")
	}

	// Delete.
	rec = doReq(t, "DELETE", "/attachments/"+meta.ID, nil, c)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d: %s", rec.Code, rec.Body.String())
	}

	// List after delete — should be empty.
	rec = doReq(t, "GET", "/tasks/"+tk.ID+"/attachments", nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("list after delete: want 200, got %d", rec.Code)
	}
	decode(t, rec, &listResp)
	if len(listResp.Data) != 0 {
		t.Fatalf("list after delete: want 0 items, got %d", len(listResp.Data))
	}

	// Activity log must contain attachment_added and attachment_removed.
	code, actResp := getActivity(t, tk.ID, c)
	if code != http.StatusOK {
		t.Fatalf("activity: got %d", code)
	}
	actions := make(map[string]activityEntry)
	for _, e := range actResp.Data {
		actions[e.Action] = e
	}
	if _, ok := actions["attachment_added"]; !ok {
		t.Fatalf("missing attachment_added activity; got actions: %v", func() []string {
			var out []string
			for k := range actions {
				out = append(out, k)
			}
			return out
		}())
	}
	if _, ok := actions["attachment_removed"]; !ok {
		t.Fatalf("missing attachment_removed activity; got actions: %v", func() []string {
			var out []string
			for k := range actions {
				out = append(out, k)
			}
			return out
		}())
	}
	// Verify filename diff in attachment_added.
	added := actions["attachment_added"]
	if added.Changes == nil {
		t.Fatal("attachment_added: expected non-null changes")
	}
}

// TestAttachmentTooLarge: file > 5 MB → 413.
func TestAttachmentTooLarge(t *testing.T) {
	resetDB(t)
	c := signup(t, "attach_large@example.com")
	tk := createTask(t, c, map[string]any{"title": "too large task"})

	// 5MB + 1 byte of zeros.
	bigData := make([]byte, 5<<20+1)

	rec := doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", c, "big.bin", "application/octet-stream", bigData)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("too large: want 413, got %d: %s", rec.Code, rec.Body.String())
	}
	// Make sure we got 413 not 422 (size check fires before type check).
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decode(t, rec, &errBody)
	if errBody.Error.Code != "payload_too_large" {
		t.Fatalf("error code: want payload_too_large, got %q", errBody.Error.Code)
	}
}

// TestAttachmentBadType: 1 KB of zeros (octet-stream) → 422 field "file".
func TestAttachmentBadType(t *testing.T) {
	resetDB(t)
	c := signup(t, "attach_type@example.com")
	tk := createTask(t, c, map[string]any{"title": "bad type task"})

	badData := make([]byte, 1024) // zeros → application/octet-stream

	rec := doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", c, "bad.bin", "application/octet-stream", badData)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bad type: want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	var errBody struct {
		Error struct {
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	decode(t, rec, &errBody)
	if errBody.Error.Fields["file"] == "" {
		t.Fatalf("want 'file' field error, got %+v", errBody.Error.Fields)
	}
}

// TestAttachmentMissingFile: multipart with no "file" field → 422.
func TestAttachmentMissingFile(t *testing.T) {
	resetDB(t)
	c := signup(t, "attach_missing@example.com")
	tk := createTask(t, c, map[string]any{"title": "missing file task"})

	rec := doMultipartNoFile(t, "/tasks/"+tk.ID+"/attachments", c)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing file: want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	var errBody struct {
		Error struct {
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	decode(t, rec, &errBody)
	if errBody.Error.Fields["file"] == "" {
		t.Fatalf("want 'file' field error, got %+v", errBody.Error.Fields)
	}
}

// TestAttachmentOwnership: various ownership scenarios.
func TestAttachmentOwnership(t *testing.T) {
	resetDB(t)
	owner := signup(t, "attach_owner@example.com")
	intruder := signup(t, "attach_intruder@example.com")

	tk := createTask(t, owner, map[string]any{"title": "owner task"})
	pngBytes := minimalPNGBytes(t)

	// Owner uploads successfully.
	rec := doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", owner, "test.png", "image/png", pngBytes)
	if rec.Code != http.StatusCreated {
		t.Fatalf("owner upload: want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var meta attachmentMeta
	decode(t, rec, &meta)

	// Intruder upload to another's task → 404.
	rec = doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", intruder, "evil.png", "image/png", pngBytes)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("intruder upload: want 404, got %d", rec.Code)
	}

	// Intruder download → 404.
	rec = doReq(t, "GET", "/attachments/"+meta.ID, nil, intruder)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("intruder download: want 404, got %d", rec.Code)
	}

	// Intruder delete → 404.
	rec = doReq(t, "DELETE", "/attachments/"+meta.ID, nil, intruder)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("intruder delete: want 404, got %d", rec.Code)
	}

	// Admin CAN download → 200.
	adminCookie := signup(t, "attach_admin@example.com")
	adminCookie = promoteToAdmin(t, "attach_admin@example.com")

	rec = doReq(t, "GET", "/attachments/"+meta.ID, nil, adminCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin download: want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Admin CAN list attachments for a task → 200.
	rec = doReq(t, "GET", "/tasks/"+tk.ID+"/attachments", nil, adminCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin list: want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Admin CANNOT upload to another user's task → 404.
	rec = doMultipartUpload(t, "/tasks/"+tk.ID+"/attachments", adminCookie, "admin.png", "image/png", pngBytes)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("admin upload to others task: want 404, got %d", rec.Code)
	}

	// Admin CANNOT delete another user's attachment → 404.
	rec = doReq(t, "DELETE", "/attachments/"+meta.ID, nil, adminCookie)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("admin delete others attachment: want 404, got %d", rec.Code)
	}
}
