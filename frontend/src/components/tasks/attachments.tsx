"use client";

import {
  useRef,
  useState,
  useCallback,
  DragEvent,
  ChangeEvent,
} from "react";
import { FileText, File, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttachments, useUploadAttachment, useDeleteAttachment } from "@/hooks/use-attachments";
import type { Attachment } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ACCEPT_ATTR = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,image/*,application/pdf,text/plain";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return `File type "${file.type || file.name.split(".").pop()}" is not allowed. Accepted: PNG, JPEG, GIF, WebP, PDF, TXT.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File is too large (${humanizeSize(file.size)}). Maximum is 5 MB.`;
  }
  return null;
}

// ─── Inline delete confirm strip ──────────────────────────────────────────────

interface InlineDeleteConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function InlineDeleteConfirm({ onConfirm, onCancel, isPending }: InlineDeleteConfirmProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Confirm delete">
      <span className="text-xs text-text-secondary whitespace-nowrap select-none">
        Remove?
      </span>
      <Button
        type="button"
        variant="danger"
        size="sm"
        loading={isPending}
        onClick={onConfirm}
        className="px-2! h-6! text-xs!"
      >
        Confirm
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={isPending}
        className="px-2! h-6! text-xs!"
      >
        Cancel
      </Button>
    </div>
  );
}

// ─── Attachment item ──────────────────────────────────────────────────────────

interface AttachmentItemProps {
  attachment: Attachment;
  isForeign: boolean;
  taskId: string;
}

function AttachmentItem({ attachment, isForeign, taskId }: AttachmentItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deletemutation = useDeleteAttachment(taskId);

  const handleConfirm = useCallback(() => {
    deletemutation.mutate(attachment.id, {
      onSuccess: () => setConfirmOpen(false),
      onError: () => setConfirmOpen(false),
    });
  }, [deletemutation, attachment.id]);

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-raised group transition-colors duration-150">
      {/* Thumbnail or icon */}
      <div className="shrink-0 w-10 h-10 rounded overflow-hidden flex items-center justify-center bg-raised border border-border">
        {isImage(attachment.content_type) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/attachments/${attachment.id}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover rounded"
          />
        ) : attachment.content_type === "application/pdf" ? (
          <FileText size={20} className="text-text-muted" />
        ) : (
          <File size={20} className="text-text-muted" />
        )}
      </div>

      {/* Filename + size */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium text-text truncate"
          title={attachment.filename}
        >
          {attachment.filename}
        </p>
        <p className="text-xs text-text-muted">
          {humanizeSize(attachment.size_bytes)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {confirmOpen ? (
          <InlineDeleteConfirm
            onConfirm={handleConfirm}
            onCancel={() => setConfirmOpen(false)}
            isPending={deletemutation.isPending}
          />
        ) : (
          <>
            {/* Download */}
            <a
              href={`/api/attachments/${attachment.id}`}
              download={attachment.filename}
              aria-label={`Download ${attachment.filename}`}
              className="
                inline-flex items-center justify-center
                w-6 h-6 rounded-md
                text-text-muted
                border border-transparent
                hover:bg-surface hover:text-text hover:border-border
                focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
                transition-colors duration-150
              "
            >
              <Download size={12} />
            </a>

            {/* Delete — hidden for foreign tasks */}
            {!isForeign && (
              <button
                type="button"
                aria-label={`Delete ${attachment.filename}`}
                onClick={() => setConfirmOpen(true)}
                className="
                  inline-flex items-center justify-center
                  w-6 h-6 rounded-md
                  text-text-muted
                  border border-transparent
                  hover:bg-danger-subtle hover:text-danger hover:border-danger/20
                  focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
                  transition-colors duration-150
                  cursor-pointer
                "
              >
                <Trash2 size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AttachmentsProps {
  taskId: string;
  isForeign: boolean;
}

export function Attachments({ taskId, isForeign }: AttachmentsProps) {
  const { data: attachments, isLoading } = useAttachments(taskId);
  const uploadMutation = useUploadAttachment(taskId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const err = validateFile(file);
      if (err) {
        setClientError(err);
        return;
      }
      setClientError(null);
      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    // Reset so same file can be re-selected if needed
    e.target.value = "";
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border">
      {/* Heading */}
      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
        Attachments
      </span>

      {/* Upload zone — hidden for foreign tasks */}
      {!isForeign && (
        <div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload attachment: drag and drop or click to browse"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!uploadMutation.isPending) fileInputRef.current?.click();
              }
            }}
            className={`
              flex flex-col items-center justify-center gap-1
              py-3 px-4 rounded-md border-2 border-dashed
              text-xs text-text-muted
              transition-colors duration-150
              ${dragOver
                ? "border-accent bg-accent/5 text-accent"
                : "border-border hover:border-border-strong hover:bg-raised"
              }
              ${uploadMutation.isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
            `}
          >
            {uploadMutation.isPending ? (
              <span>Uploading…</span>
            ) : (
              <>
                <span className="font-medium">Drop file here or click to browse</span>
                <span className="text-text-muted/70">PNG, JPEG, GIF, WebP, PDF, TXT — max 5 MB</span>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleInputChange}
          />

          {/* Client-side validation error */}
          {clientError && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {clientError}
            </p>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-1" aria-busy="true" aria-label="Loading attachments">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      ) : !attachments || attachments.length === 0 ? (
        <p className="text-xs text-text-muted italic">No attachments.</p>
      ) : (
        <div className="flex flex-col">
          {attachments.map((a) => (
            <AttachmentItem
              key={a.id}
              attachment={a}
              isForeign={isForeign}
              taskId={taskId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
