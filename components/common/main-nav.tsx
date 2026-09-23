"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { FlowerMark } from "@/components/common/flower";
import { Icons } from "@/components/common/icons";
import { ModeToggle } from "@/components/common/mode-toggle";
import { mainNav } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { primarySocial } from "@/config/socials";
import { cn } from "@/lib/utils";

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const PrimaryIcon = Icons[primarySocial.icon];

  return (
    <>
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            aria-label={`${siteConfig.name} — home`}
            className="group shrink-0 text-foreground transition-opacity hover:opacity-70"
          >
            <FlowerMark className="w-6" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "label transition-colors hover:text-foreground",
                  isActive(item.href) && "text-foreground"
                )}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={primarySocial.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${siteConfig.name} on ${primarySocial.name}`}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <PrimaryIcon className="h-4 w-4" />
          </a>
          <ModeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            {open ? (
              <Icons.close className="h-4 w-4" />
            ) : (
              <Icons.menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-[65px] z-40 border-t border-border bg-background md:hidden">
          <nav className="container flex flex-col py-6">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "py-4 font-display text-4xl font-semibold lowercase tracking-tight transition-colors",
                  isActive(item.href) ? "text-accent" : "text-foreground"
                )}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
