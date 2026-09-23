"use client";

import { useTheme } from "next-themes";
import * as React from "react";

import { Icons } from "@/components/common/icons";

/** Cream by day, forest by night. Two states, no menu. */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      {isDark ? (
        <Icons.sun className="h-4 w-4" />
      ) : (
        <Icons.moon className="h-4 w-4" />
      )}
    </button>
  );
}
