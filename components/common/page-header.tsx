import { Reveal } from "@/components/common/reveal";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="pb-12 pt-4">
      {eyebrow && (
        <Reveal className="label mb-4 block">{eyebrow}</Reveal>
      )}
      <Reveal delay={0.05}>
        <h1 className="font-display text-5xl font-normal leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
          {title}
        </h1>
      </Reveal>
      {description && (
        <Reveal delay={0.12}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        </Reveal>
      )}
    </header>
  );
}
