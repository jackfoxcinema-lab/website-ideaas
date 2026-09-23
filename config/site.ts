/**
 * Everything brand-level lives here. Edit this file first.
 */
export const siteConfig = {
  /** Brand / artist name, set in caps wherever it appears. */
  name: "FLORE",
  /** Used for author credit and structured data. */
  authorName: "FLORE",
  /** One line that sits under the name on the home page. */
  tagline: "songs from one place, still growing",
  /** Longer blurb used for SEO and social cards. */
  description:
    "FLORE — songs, and the ongoing world they come from. An unfinished body of work, added to as it arrives.",
  /** Set NEXT_PUBLIC_SITE_URL in production (e.g. on Vercel) to your real domain. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://flore.example.com",
  /** Path to the Open Graph image inside /public. */
  ogImage: "/og.png",
  /** Shown on the contact/about page. */
  email: "hello@flore.example.com",
  keywords: [
    "flore",
    "music",
    "concept album",
    "worldbuilding",
    "songwriting",
    "body of work",
    "independent artist",
    "youtube musician",
  ],
} as const;
