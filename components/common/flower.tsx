import { cn } from "@/lib/utils";

/**
 * Three petal shapes rather than one rotated five times. A single repeated
 * path reads as a cartoon daisy; mixing a round one, one with a straight
 * scissor edge and a lopsided one is what makes it look cut from paper.
 * Petals reach past the 100-unit box on purpose, so the square crops them
 * flat the way the artwork does.
 */
const PETALS_SHAPES = {
  round: "M 0,-6 C -21,-10 -31,-31 -22,-46 C -14,-57 9,-59 17,-47 C 25,-35 18,-13 0,-6 Z",
  cut: "M 0,-6 C -19,-13 -27,-29 -23,-44 L -6,-57 C 7,-59 17,-50 18,-39 C 19,-24 15,-12 0,-6 Z",
  lopsided: "M 0,-6 C -23,-9 -30,-27 -25,-42 C -21,-55 -2,-60 13,-51 C 24,-44 20,-16 0,-6 Z",
} as const;

/**
 * Per-petal shape, tilt and scale. Hand-picked, not random, so the flower is
 * identical on the server and the client — and stays slightly uneven.
 */
const PETALS = [
  { angle: 0, tilt: -5, scale: 1.0, shape: "round" },
  { angle: 72, tilt: 4, scale: 0.93, shape: "cut" },
  { angle: 144, tilt: -3, scale: 1.06, shape: "lopsided" },
  { angle: 216, tilt: 6, scale: 0.96, shape: "round" },
  { angle: 288, tilt: -2, scale: 1.01, shape: "cut" },
] as const;

interface FlowerProps {
  className?: string;
  /** Adds the dark ground and grass blades of the moodboard crop. */
  ground?: boolean;
  /** Background fill inside the square. "none" leaves it transparent. */
  block?: "sage" | "cream" | "none";
  /** Gentle sway, as if there's a breeze. Off by default. */
  animate?: boolean;
}

export function Flower({
  className,
  ground = true,
  block = "sage",
  animate = false,
}: FlowerProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="A cut-paper flower"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        {/* The square crop: petals spill visually but never leave the block. */}
        <clipPath id="flore-crop">
          <rect x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>

      <g clipPath="url(#flore-crop)">
        {block !== "none" && (
          <rect
            width="100"
            height="100"
            fill={block === "sage" ? "hsl(var(--sage))" : "hsl(var(--card))"}
          />
        )}

        {ground && (
          <g fill="hsl(var(--ink))">
            {/* Uneven ground line, not a straight edge. */}
            <path d="M0,74 C14,70 26,77 40,75 C56,72 70,79 84,74 C91,71 96,73 100,71 L100,100 L0,100 Z" />
            {/* A couple of blades pushing up past the ground. */}
            <path d="M72,76 C74,64 79,56 86,50 C82,60 80,68 79,76 Z" />
            <path d="M22,76 C20,67 16,60 10,55 C15,63 17,69 18,76 Z" />
          </g>
        )}

        {/*
          Two nested groups on purpose. A CSS transform REPLACES an element's
          SVG transform attribute rather than composing with it, so the
          positioning lives on the outer group (attribute only) and the sway on
          the inner one (CSS only). Put both on one element and the flower
          jumps to the viewBox origin.
        */}
        <g transform="translate(50 45) scale(0.87)">
          <g
            className={cn(animate && "animate-sway motion-reduce:animate-none")}
            style={animate ? { transformOrigin: "0px 0px" } : undefined}
          >
            {PETALS.map((p) => (
              <path
                key={p.angle}
                d={PETALS_SHAPES[p.shape]}
                fill="hsl(var(--cream))"
                transform={`rotate(${p.angle + p.tilt}) scale(${p.scale})`}
              />
            ))}
            <circle r="13.5" fill="hsl(var(--marigold))" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Tiny flower mark for the nav, footer and empty states. */
export function FlowerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn("h-auto w-full", className)}
    >
      <g transform="translate(50 50)">
        {PETALS.map((p) => (
          <path
            key={p.angle}
            d={PETALS_SHAPES[p.shape]}
            fill="currentColor"
            transform={`rotate(${p.angle + p.tilt}) scale(${p.scale * 0.82})`}
          />
        ))}
        <circle r="13.5" fill="hsl(var(--marigold))" />
      </g>
    </svg>
  );
}
