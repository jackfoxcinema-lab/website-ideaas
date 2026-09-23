import type * as React from "react";

import { cn } from "@/lib/utils";

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger in seconds. */
  delay?: number;
  as?: "div" | "section" | "article" | "header";
}

/**
 * Entrance fade-up. Pure CSS on purpose — no client component, no observer,
 * so it costs nothing at runtime and still respects reduced-motion via the
 * `motion-reduce` variant.
 */
export function Reveal({
  delay = 0,
  as: Tag = "div",
  className,
  style,
  children,
  ...props
}: RevealProps) {
  return (
    <Tag
      className={cn("animate-fade-up motion-reduce:animate-none", className)}
      style={{ animationDelay: `${delay}s`, ...style }}
      {...props}
    >
      {children}
    </Tag>
  );
}
