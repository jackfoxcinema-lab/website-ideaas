/**
 * Paper grain over the whole viewport.
 *
 * Rendered once as a fixed SVG turbulence layer rather than a tiled PNG, so
 * there's no asset to ship and it stays crisp at any density. Strength and
 * blend mode come from CSS variables, because the same noise that reads as
 * paper on cream reads as dust on the dark theme.
 */
export function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
      style={{
        opacity: "var(--grain-opacity)",
        mixBlendMode: "var(--grain-blend)" as React.CSSProperties["mixBlendMode"],
      }}
    >
      <filter id="flore-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.75"
          numOctaves="4"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#flore-grain)" />
    </svg>
  );
}
