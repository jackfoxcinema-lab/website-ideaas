import { Icons } from "@/components/common/icons";

export interface SocialLink {
  name: string;
  /** Shown as the handle next to the icon. */
  handle: string;
  href: string;
  icon: keyof typeof Icons;
  /** Pinned to the header and the home-page call to action. */
  primary?: boolean;
}

/**
 * Replace the handles and URLs with your real accounts.
 * Delete any row you don't use — the header, footer and about page all read
 * from this one list.
 */
export const socialLinks: SocialLink[] = [
  {
    name: "Instagram",
    handle: "@flore",
    href: "https://instagram.com/flore",
    icon: "instagram",
    primary: true,
  },
  {
    name: "YouTube",
    handle: "@flore",
    href: "https://youtube.com/@flore",
    icon: "youtube",
  },
  {
    name: "Spotify",
    handle: "flore",
    href: "https://open.spotify.com/artist/",
    icon: "spotify",
  },
  {
    name: "SoundCloud",
    handle: "flore",
    href: "https://soundcloud.com/flore",
    icon: "soundcloud",
  },
  {
    name: "Email",
    handle: "hello@flore.example.com",
    href: "mailto:hello@flore.example.com",
    icon: "mail",
  },
];

export const primarySocial =
  socialLinks.find((s) => s.primary) ?? socialLinks[0];
