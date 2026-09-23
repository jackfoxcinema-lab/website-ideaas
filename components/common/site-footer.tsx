import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { siteConfig } from "@/config/site";
import { socialLinks } from "@/config/socials";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container flex flex-col gap-8 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/"
            className="font-display text-3xl leading-none tracking-tight transition-opacity hover:opacity-70"
          >
            {siteConfig.name}
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {siteConfig.description}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:items-end">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {socialLinks.map((social) => {
              const Icon = Icons[social.icon];
              return (
                <li key={social.href}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    className="label inline-flex items-center gap-2 transition-colors hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {social.name}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="label">
            &copy; {new Date().getFullYear()} {siteConfig.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
