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
    name: "YouTube",
    // TODO: your real channel handle and URL.
    handle: "@FLORE",
    href: "https://youtube.com/@FLORE",
    icon: "youtube",
    // The songs live here, so this is the icon in the header and the button
    // on the home page.
    primary: true,
  },
  {
    name: "Instagram",
    handle: "@flore",
    href: "https://instagram.com/flore",
    icon: "instagram",
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
