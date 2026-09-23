"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Icons } from "@/components/common/icons";
import { ModeToggle } from "@/components/common/mode-toggle";
import { mainNav } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { primarySocial } from "@/config/socials";
import { cn } from "@/lib/utils";

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the sheet whenever navigation lands somewhere new.
  React.useEffect(() => setOpen(false), [pathname]);

  // Lock scroll while the mobile sheet is up.
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
        <Link
          href="/"
          className="font-display text-2xl leading-none tracking-tight transition-opacity hover:opacity-70"
        >
          {siteConfig.name}
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

        <div className="flex items-center gap-2">
          <a
            href={primarySocial.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${siteConfig.name} on ${primarySocial.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            <PrimaryIcon className="h-4 w-4" />
          </a>
          <ModeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground md:hidden"
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
        <div className="fixed inset-x-0 top-[73px] z-40 border-t border-border bg-background md:hidden">
          <nav className="container flex flex-col divide-y divide-border">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "py-5 font-display text-3xl tracking-tight transition-colors",
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
