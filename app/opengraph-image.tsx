import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Generated at build time so there's no PNG to keep in sync with the brand. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#0a0a0a",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8a8a80",
            marginBottom: 24,
          }}
        >
          {siteConfig.tagline}
        </div>
        <div
          style={{
            fontSize: 180,
            fontFamily: "Georgia, serif",
            color: "#eae7e0",
            lineHeight: 0.9,
          }}
        >
          {siteConfig.name}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 48,
            alignItems: "flex-end",
            height: 60,
          }}
        >
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${20 + Math.abs(Math.sin(i * 0.7)) * 80}%`,
                background: i < 18 ? "#b6c79a" : "#2e2e2b",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size
  );
}
