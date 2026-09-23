import { Reveal } from "@/components/common/reveal";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Page titles are set lowercase; the brand name is not. */
  lowercase?: boolean;
}

/** Centred page title, with a lot of air above and below it. */
export function PageHeader({
  eyebrow,
  title,
  description,
  lowercase = true,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col items-center pb-20 pt-16 text-center sm:pt-24">
      {eyebrow && <Reveal className="label mb-6 block">{eyebrow}</Reveal>}
      <Reveal delay={0.05}>
        <h1
          className={cn(
            "font-display text-5xl font-semibold leading-[0.95] sm:text-6xl",
            lowercase ? "lowercase tracking-[-0.03em]" : "tracking-[-0.01em]"
          )}
        >
          {title}
        </h1>
      </Reveal>
      {description && (
        <Reveal delay={0.12}>
          <p className="mx-auto mt-7 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </Reveal>
      )}
    </header>
  );
}
