"use client";

import { cn } from "@/lib/utils";

type DitherMode = "bayer" | "ordered";
type ColorMode = "grayscale" | "rgb" | "duotone";

interface DitherShaderProps {
  src: string;
  gridSize?: number;
  ditherMode?: DitherMode;
  colorMode?: ColorMode;
  invert?: boolean;
  animated?: boolean;
  animationSpeed?: number;
  primaryColor?: string;
  secondaryColor?: string;
  threshold?: number;
  className?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function makePixelTile(
  fill: string,
  tileSize: number,
  dotSize: number,
  x = 0,
  y = 0
) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tileSize}' height='${tileSize}' viewBox='0 0 ${tileSize} ${tileSize}'><rect x='${x}' y='${y}' width='${dotSize}' height='${dotSize}' fill='${fill}'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function DitherShader({
  src,
  gridSize = 2,
  ditherMode = "bayer",
  colorMode = "grayscale",
  invert = false,
  animated = false,
  animationSpeed = 0.02,
  primaryColor = "#000000",
  secondaryColor = "#f5f5f5",
  threshold = 0.5,
  className,
}: DitherShaderProps) {
  const normalizedThreshold = clamp(threshold, 0, 1);
  const cell = Math.max(2, Math.round(gridSize * 2.2));
  const pulse = Math.max(8, 30 / Math.max(0.01, animationSpeed));

  const fg = invert ? secondaryColor : primaryColor;
  const bg = invert ? primaryColor : secondaryColor;

  const imageFilter = [
    colorMode !== "rgb" ? "grayscale(1)" : "",
    invert ? "invert(1)" : "",
    `contrast(${1 + normalizedThreshold * 0.35})`,
    `brightness(${0.82 + normalizedThreshold * 0.18})`,
  ]
    .filter(Boolean)
    .join(" ");

  const pixelSize = Math.max(
    1,
    Math.min(cell - 1, Math.round(cell * (0.34 + normalizedThreshold * 0.3)))
  );
  const primaryTile = makePixelTile(fg, cell, pixelSize, 0, 0);
  const secondaryTile = makePixelTile(fg, cell * 2, pixelSize, cell, cell);

  const basePattern =
    ditherMode === "bayer"
      ? `${primaryTile}, ${secondaryTile}`
      : primaryTile;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: imageFilter,
        }}
      />
      {colorMode === "duotone" && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: primaryColor,
              mixBlendMode: "multiply",
              opacity: 0.55,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: secondaryColor,
              mixBlendMode: "screen",
              opacity: 0.14,
            }}
          />
        </>
      )}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: bg,
          opacity:
            colorMode === "duotone"
              ? 0.04 + (1 - normalizedThreshold) * 0.05
              : 0.08 + (1 - normalizedThreshold) * 0.12,
          mixBlendMode: "multiply",
        }}
      />
      <div
        className={cn("absolute inset-0", animated && "dither-shader-animate")}
        style={{
          backgroundImage: basePattern,
          backgroundSize:
            ditherMode === "bayer"
              ? `${cell}px ${cell}px, ${cell * 2}px ${cell * 2}px`
              : `${cell}px ${cell}px`,
          opacity: 0.28 + normalizedThreshold * 0.24,
          mixBlendMode: invert ? "screen" : "multiply",
          animationDuration: `${pulse.toFixed(2)}s`,
        }}
      />
      <style jsx>{`
        .dither-shader-animate {
          animation-name: ditherShaderPan;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes ditherShaderPan {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-${cell}px, -${cell}px, 0);
          }
        }
      `}</style>
    </div>
  );
}
