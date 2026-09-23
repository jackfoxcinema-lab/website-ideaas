/**
 * A hand-curated grid of Instagram posts for the home page.
 *
 * This is deliberately manual: the Instagram Graph API needs a Business or
 * Creator account plus a long-lived token, which is a lot of setup for a
 * handful of tiles. To add a post, save its image into /public/instagram and
 * paste the post URL here. See README for the automated route if you'd
 * rather wire up the API later.
 */
export interface InstagramPost {
  id: string;
  /** Local image under /public/instagram. */
  image: string;
  /** Short caption shown on hover. */
  caption: string;
  /** Permalink to the post. */
  href: string;
}

export const instagramPosts: InstagramPost[] = [];
