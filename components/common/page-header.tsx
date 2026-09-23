import { Reveal } from "@/components/common/reveal";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

/** Centred page title, with a lot of air above and below it. */
export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="flex flex-col items-center pb-20 pt-16 text-center sm:pt-24">
      {eyebrow && <Reveal className="label mb-6 block">{eyebrow}</Reveal>}
      <Reveal delay={0.05}>
        <h1 className="font-display text-5xl font-semibold lowercase leading-[0.95] tracking-[-0.03em] sm:text-6xl">
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
