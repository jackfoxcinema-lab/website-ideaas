import Link from "next/link";

interface SectionHeadingProps {
  /** Uppercase mono label — the section's name. */
  title: string;
  href?: string;
  linkLabel?: string;
}

/**
 * The dowfi-style section rule: a tracked-out label on the left, an arrow on
 * the right, a hairline underneath. Deliberately quiet — the content is what
 * should carry weight.
 */
export function SectionHeading({
  title,
  href,
  linkLabel = "See all",
}: SectionHeadingProps) {
  return (
    <div className="mb-10 flex items-center justify-between gap-6 border-b border-border pb-4">
      <h2 className="label text-foreground">{title}</h2>
      {href && (
        <Link
          href={href}
          aria-label={linkLabel}
          className="group flex items-center gap-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="label sr-only sm:not-sr-only">{linkLabel}</span>
          <svg viewBox="0 0 24 12" className="h-3 w-7" aria-hidden="true">
            <path
              d="M0 6 H21 M16 1 L22 6 L16 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="transition-transform duration-300 group-hover:translate-x-1"
              style={{ transformOrigin: "center" }}
            />
          </svg>
        </Link>
      )}
    </div>
  );
}
