/**
 * Everything brand-level lives here. Edit this file first.
 */
export const siteConfig = {
  /** Brand / artist name, lowercase everywhere by design. */
  name: "flore",
  /** Used for author credit and structured data. */
  authorName: "flore",
  /** One line that sits under the name on the home page. */
  tagline: "songs in progress",
  /** Longer blurb used for SEO and social cards. */
  description:
    "flore — song snippets, works in progress, and writing about how they get made.",
  /** Set NEXT_PUBLIC_SITE_URL in production (e.g. on Vercel) to your real domain. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://flore.example.com",
  /** Path to the Open Graph image inside /public. */
  ogImage: "/og.png",
  /** Shown on the contact/about page. */
  email: "hello@flore.example.com",
  keywords: [
    "flore",
    "music",
    "song snippets",
    "demos",
    "works in progress",
    "songwriting",
    "producer",
    "independent artist",
  ],
} as const;
