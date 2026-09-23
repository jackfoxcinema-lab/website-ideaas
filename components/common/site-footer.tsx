import Link from "next/link";

import { Icons } from "@/components/common/icons";
import { siteConfig } from "@/config/site";
import { socialLinks } from "@/config/socials";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-border">
      <div className="container flex flex-col items-center gap-10 py-20 text-center">
        <Link
          href="/"
          className="font-display text-2xl font-semibold leading-none tracking-[0.02em] transition-opacity hover:opacity-60"
        >
          {siteConfig.name}
        </Link>

        <p className="caption">{siteConfig.tagline}</p>

        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
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
    </footer>
  );
}
