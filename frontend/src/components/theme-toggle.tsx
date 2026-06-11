"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Placeholder avoids hydration mismatch + layout shift
  if (!mounted) {
    return (
      <span
        className="inline-flex items-center justify-center h-8 w-8"
        aria-hidden="true"
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="
        inline-flex items-center justify-center h-8 w-8 rounded-md
        text-text-secondary
        border border-border
        bg-surface
        hover:bg-raised hover:text-text
        transition-colors duration-150 ease-in-out
        focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
        cursor-pointer
      "
    >
      {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
    </button>
  );
}
