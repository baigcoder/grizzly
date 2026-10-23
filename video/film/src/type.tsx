import React from "react";
import { lightLeak } from "@remotion/effects/light-leak";
import { AbsoluteFill, Easing, interpolate, Solid, useCurrentFrame, useVideoConfig } from "remotion";
import { DISPLAY, MONO } from "./fonts";

/**
 * Type primitives for the film. Every value is driven by useCurrentFrame() (no CSS animation). Nothing is ever
 * clipped: letters rise and sharpen in place (no overflow masks), so italic glyphs keep their full shape.
 */

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

/** Seconds since the composition start. */
export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

/** 0 → 1 → 0 visibility for a block shown from `at` to `out` (seconds), with the standard in/out curves. */
export const useBlock = (at: number, out: number, inDur = 0.5, outDur = 0.32) => {
  const t = useTime();
  const enter = interpolate(t, [at, at + inDur], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const exit = interpolate(t, [out, out + outDur], [0, 1], { ...CLAMP, easing: EASE_IN });
  return { t, enter, exit, visible: t >= at - 0.05 && t <= out + outDur + 0.05 };
};

/** A line whose letters rise, sharpen and fade in one after another; the whole line lifts away on exit. */
export const Letters: React.FC<{
  text: string;
  at: number;
  out: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, at, out, stagger = 0.022, style }) => {
  const { t, exit, visible } = useBlock(at, out);
  if (!visible) return null;
  return (
    <span
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        opacity: 1 - exit,
        translate: `0 ${-exit * 0.22}em`,
        filter: exit > 0.001 ? `blur(${exit * 10}px)` : undefined,
        ...style,
      }}
    >
      {[...text].map((c, i) => {
        const k = interpolate(t, [at + i * stagger, at + i * stagger + 0.6], [0, 1], { ...CLAMP, easing: EASE_OUT });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: k,
              translate: `0 ${(1 - k) * 0.45}em`,
              filter: k < 0.999 ? `blur(${(1 - k) * 14}px)` : undefined,
            }}
          >
            {c}
          </span>
        );
      })}
    </span>
  );
};

/** A whole block that slides up and sharpens in, then lifts away. */
export const Rise: React.FC<{ at: number; out: number; children: React.ReactNode; style?: React.CSSProperties; distance?: number }> = ({
  at,
  out,
  children,
  style,
  distance = 28,
}) => {
  const { enter, exit, visible } = useBlock(at, out, 0.6);
  if (!visible) return null;
  return (
    <div
      style={{
        opacity: enter * (1 - exit),
        translate: `0 ${(1 - enter) * distance - exit * distance * 0.6}px`,
        filter: enter < 0.999 || exit > 0.001 ? `blur(${(1 - enter) * 10 + exit * 10}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Width of a display line at 100 px (Libre Franklin 900 italic, uppercase), measured on a canvas. */
let measureCtx: CanvasRenderingContext2D | null = null;
const measureDisplay = (text: string) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 66;
  measureCtx.font = 'italic 900 100px "Libre Franklin"';
  // the italic overhang and the right padding of each line
  return measureCtx.measureText(text).width + 14;
};

/**
 * Display title, second line in the accent (the site's flavor title). `maxWidth` fits the size to the column, so a
 * long name (STRAWBERRY, ELECTROLYTES) shrinks instead of running into the product.
 */
export const Title: React.FC<{ lines: string[]; at: number; out: number; size: number; accent: string; align?: "left" | "center"; maxWidth?: number }> = ({
  lines,
  at,
  out,
  size,
  accent,
  align = "left",
  maxWidth,
}) => {
  const widest = Math.max(...lines.map(measureDisplay));
  const fitted = maxWidth ? Math.min(size, (maxWidth * 100) / widest) : size;
  return (
    <div style={{ ...DISPLAY, fontSize: fitted, textAlign: align, textShadow: "0 0.04em 0.35em rgba(0,0,0,0.35)" }}>
      {lines.map((line, i) => (
        <div key={i} style={{ color: i === lines.length - 1 && lines.length > 1 ? accent : "#f4f6fa", paddingRight: "0.12em" }}>
          <Letters text={line} at={at + i * 0.12} out={out} />
        </div>
      ))}
    </div>
  );
};

/** The site's index chip: a rounded pill with mono text. */
export const Chip: React.FC<{ children: React.ReactNode; size: number; color?: string; filled?: boolean; style?: React.CSSProperties }> = ({
  children,
  size,
  color = "rgba(244,246,250,0.9)",
  filled = false,
  style,
}) => (
  <div
    style={{
      ...MONO,
      fontSize: size,
      color: filled ? "#05070b" : color,
      background: filled ? "#f4f6fa" : "rgba(5,8,14,0.28)",
      border: `${Math.max(1.5, size * 0.06)}px solid ${filled ? "#f4f6fa" : color}`,
      borderRadius: 999,
      padding: "0.62em 1.05em 0.58em 1.33em",
      display: "inline-block",
      backdropFilter: filled ? undefined : "blur(6px)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Thin corner brackets framing the picture (the site's frame furniture). */
export const Corners: React.FC<{ opacity: number }> = ({ opacity }) => {
  const { width, height } = useVideoConfig();
  const inset = Math.round(Math.min(width, height) * 0.045);
  const arm = Math.round(Math.min(width, height) * 0.032);
  const line = "rgba(244,246,250,0.55)";
  const corner = (x: "left" | "right", y: "top" | "bottom") => (
    <div
      key={x + y}
      style={{
        position: "absolute",
        [x]: inset,
        [y]: inset,
        width: arm,
        height: arm,
        [`border${y === "top" ? "Top" : "Bottom"}`]: `2px solid ${line}`,
        [`border${x === "left" ? "Left" : "Right"}`]: `2px solid ${line}`,
      }}
    />
  );
  return <AbsoluteFill style={{ opacity }}>{[corner("left", "top"), corner("right", "top"), corner("left", "bottom"), corner("right", "bottom")]}</AbsoluteFill>;
};

/** A build callout: a dot on the part, a leader that draws out, and a mono label. */
export const Callout: React.FC<{ at: number; out: number; x: number; y: number; label: string; size: number; flip?: boolean }> = ({
  at,
  out,
  x,
  y,
  label,
  size,
  flip = false,
}) => {
  const { width, height } = useVideoConfig();
  const { t, enter, exit, visible } = useBlock(at, out, 0.45, 0.25);
  if (!visible) return null;
  const draw = interpolate(t, [at, at + 0.4], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const len = size * (height > width ? 2.6 : 5);
  const dir = flip ? -1 : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: 1 - exit }}>
      <div
        style={{
          position: "absolute",
          left: -size * 0.28,
          top: -size * 0.28,
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: "50%",
          background: "#f4f6fa",
          boxShadow: `0 0 0 ${size * 0.32}px rgba(244,246,250,${0.18 * enter})`,
          scale: String(enter),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: flip ? -len - size * 0.6 : size * 0.6,
          top: -1,
          width: len,
          height: 2,
          background: "rgba(244,246,250,0.75)",
          transformOrigin: flip ? "right center" : "left center",
          scale: `${draw} 1`,
        }}
      />
      <div
        style={{
          position: "absolute",
          [flip ? "right" : "left"]: len + size * 1.1,
          top: -size * 0.95,
          opacity: interpolate(t, [at + 0.2, at + 0.5], [0, 1], CLAMP),
          translate: `${(1 - enter) * 16 * dir}px 0`,
          whiteSpace: "nowrap",
        }}
      >
        <Chip size={size * 0.62}>{label}</Chip>
      </div>
    </div>
  );
};

/** A light leak played over a cut (WebGL2; screen-blended so it only ever adds light). */
export const LightLeak: React.FC<{ seed: number; hueShift: number; opacity?: number }> = ({ seed, hueShift, opacity = 0.6 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, height, width } = useVideoConfig();
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity }}>
      <Solid
        width={width}
        height={height}
        effects={[
          lightLeak({
            seed,
            hueShift,
            progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], CLAMP),
          }),
        ]}
      />
    </AbsoluteFill>
  );
};
