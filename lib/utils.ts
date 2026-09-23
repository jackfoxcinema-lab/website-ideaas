import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "September 14, 2026" */
export function formatDate(input: string | number | Date): string {
  return new Date(input).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "14.09.26" — compact form used in list rows. */
export function formatDateShort(input: string | number | Date): string {
  return new Date(input).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** Seconds -> "1:04". Returns "--:--" for unknown/NaN durations. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
