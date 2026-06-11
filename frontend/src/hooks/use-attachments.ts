"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiUpload, ApiError } from "@/lib/api";
import type { Attachment } from "@/lib/types";

interface AttachmentListResponse {
  data: Attachment[];
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useAttachments(taskId: string | null) {
  return useQuery<Attachment[]>({
    queryKey: ["attachments", taskId],
    queryFn: async ({ signal }) => {
      const res = await api<AttachmentListResponse>(`/tasks/${taskId}/attachments`, { signal });
      return res.data ?? [];
    },
    enabled: !!taskId,
    staleTime: 10_000,
  });
}

// ─── Upload mutation ──────────────────────────────────────────────────────────

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (file: File) =>
      apiUpload<Attachment>(`/tasks/${taskId}/attachments`, file),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
      qc.invalidateQueries({ queryKey: ["activity", taskId] });
      toast.success("Attachment added");
    },

    onError: (e) => {
      if (e instanceof ApiError) {
        // 422 field-level error: show the "file" field message if present
        if (e.fields?.file) {
          toast.error(e.fields.file);
          return;
        }
        toast.error(e.message || "Upload failed");
      } else {
        toast.error("Upload failed");
      }
    },
  });
}

// ─── Delete mutation ──────────────────────────────────────────────────────────

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      api(`/attachments/${attachmentId}`, { method: "DELETE" }),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
      qc.invalidateQueries({ queryKey: ["activity", taskId] });
      toast.success("Attachment removed");
    },

    onError: (e) => {
      const err = e instanceof ApiError ? e : null;
      toast.error(err?.message ?? "Couldn't delete attachment");
    },
  });
}
