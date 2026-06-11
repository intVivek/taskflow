"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useUser, useLogout } from "@/hooks/use-user";

export function AppHeader() {
  const { data: user } = useUser();
  const logout = useLogout();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 bg-surface border-b border-border">
      <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
        {/* Wordmark */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text tracking-tight text-sm">
            TaskFlow
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user?.email && (
            <span className="text-xs text-text-muted max-[479px]:hidden inline truncate max-w-[180px]">
              {user.email}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={loggingOut}
            onClick={handleLogout}
            className="h-11 sm:h-8 px-3"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
