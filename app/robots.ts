import type { MetadataRoute } from "next";

// Emitted as a file at build time; required for `output: export`.
export const dynamic = "force-static";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
