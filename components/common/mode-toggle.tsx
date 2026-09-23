"use client";

import { useTheme } from "next-themes";
import * as React from "react";

import { Icons } from "@/components/common/icons";

/**
 * Two-state toggle. Dark is the default look, so this only ever swaps between
 * dark and light rather than offering a full menu.
 */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isLight = resolvedTheme === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
    >
      {/* Render a stable icon until mounted so SSR and client markup agree. */}
      {mounted && isLight ? (
        <Icons.moon className="h-4 w-4" />
      ) : (
        <Icons.sun className="h-4 w-4" />
      )}
    </button>
  );
}
