"use client";

import {
  useEffect,
  useRef,
  useId,
  ReactNode,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { X } from "lucide-react";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  // Capture opener element and restore focus on close
  const openerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
    } else {
      const opener = openerRef.current as HTMLElement | null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
      openerRef.current = null;
    }
  }, [open]);

  // Move focus into the dialog when it opens. React handles autoFocus
  // imperatively (no DOM attribute), so if a child already claimed focus
  // during mount, leave it alone; otherwise focus the first focusable.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (document.activeElement && panel.contains(document.activeElement)) return;
    const el =
      panel.querySelector<HTMLElement>("[autofocus]") ??
      panel.querySelector<HTMLElement>(FOCUSABLE);
    el?.focus();
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Focus trap
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Overlay click closes; click inside panel does NOT
  function handleOverlayMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onMouseDown={handleOverlayMouseDown}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="
          relative z-10 w-full max-w-lg
          bg-surface border border-border
          rounded-xl shadow-xl
          flex flex-col
          max-h-[90vh] overflow-y-auto
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2
            id={titleId}
            className="text-sm font-semibold text-text tracking-tight"
          >
            {title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            className="px-3! h-11! sm:px-1.5! sm:h-7!"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
