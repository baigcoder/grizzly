import React, { useEffect, useState } from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BENEFITS, BRAND, BRAND_BLUE, FLAVORS, FLAVOR_SLOT, GOLD, SITE, T, ZAMZAM_LINE, benefitAt, flavorAt } from "./brand";
import { BODY, DISPLAY, MONO, fontsReady } from "./fonts";
import { Callout, Chip, Corners, Letters, LightLeak, Rise, Title, useTime } from "./type";

/**
 * The full product film: the 3D plate (the site's own scene, rendered frame-exact by video/render.mjs) under the type
 * layer, with the score. Landscape and vertical share every component; `useLayout` decides where things sit.
 */

type Anchors = { frames: Array<Record<string, [number, number]>> };

export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 100; // 1% of the short side
  return {
    portrait,
    width,
    height,
    u,
    // the type column: left third in landscape (the product sits right), the lower third in vertical
    column: portrait
      ? ({ position: "absolute", left: 7.5 * u, right: 7.5 * u, bottom: 11 * u } as React.CSSProperties)
      : ({ position: "absolute", left: 7.4 * u * 1.78, top: 0, bottom: 0, width: "44%", display: "flex", flexDirection: "column", justifyContent: "center" } as React.CSSProperties),
    title: portrait ? 11.5 * u : 14 * u,
    // widest a column title may run: clear of the can and the ghost type behind it
    colWidth: portrait ? width - 15 * u : width * 0.47 - 13.2 * u,
    body: portrait ? 4.2 * u : 4.6 * u,
    mono: portrait ? 2.7 * u : 2.6 * u,
  };
};

const useAnchors = (variant: string) => {
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [handle] = useState(() => delayRender(`anchors-${variant}`));
  useEffect(() => {
    fetch(staticFile(`anchors-${variant}.json`))
      .then((r) => r.json())
      .then((a: Anchors) => {
        setAnchors(a);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle, variant]);
  return anchors;
};

const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    fontsReady.then(() => continueRender(handle));
  }, [handle]);
};

/** 0 → 1 → 0 opacity over [a, b] with soft edges (seconds). */
const useWindow = (a: number, b: number, edge = 0.4) => {
  const t = useTime();
  return interpolate(t, [a, a + edge, b - edge, b], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

// ───────────────────────── scenes ─────────────────────────

const Hook: React.FC = () => {
  const L = useLayout();
  return (
    <div style={L.column}>
      <Title lines={["FUEL YOUR", "WILD SIDE"]} at={T.slam} out={T.reveal - 0.25} size={L.title * 1.05} accent={BRAND_BLUE} maxWidth={L.colWidth} />
    </div>
  );
};

const Reveal: React.FC = () => {
  const L = useLayout();
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: L.portrait ? 12 * L.u : 7.5 * L.u }}>
      <Rise at={T.reveal + 0.9} out={5.55}>
        <div style={{ ...MONO, fontSize: L.mono * 1.15, color: "#f4f6fa", textAlign: "center", lineHeight: 1.8 }}>
          Halal certified energy drink
          <br />
          <span style={{ color: "rgba(244,246,250,0.7)" }}>
            {BRAND.origin} · {BRAND.volume}
          </span>
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const Build: React.FC<{ anchors: Anchors | null }> = ({ anchors }) => {
  const L = useLayout();
  const frame = useCurrentFrame();
  const a = anchors?.frames[frame] ?? {};
  const size = L.portrait ? 3.4 * L.u : 4.2 * L.u;
  // the plate anchors sit on the can's right edge; in the tall frame the can is centred, so the side callouts are
  // mirrored to its left edge and hang left, leaving the right for the tab
  const at = (name: string): [number, number] => {
    const p = a[name];
    if (!p) return [-999, -999];
    return L.portrait && name !== "tab" ? [L.width - p[0], p[1]] : p;
  };
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: L.portrait ? 7.5 * L.u : 13 * L.u, top: L.portrait ? 9 * L.u : 9 * L.u }}>
        <Rise at={T.build + 0.3} out={T.flavors - 0.6}>
          <Chip size={L.mono}>01 · The can</Chip>
        </Rise>
      </div>
      <Callout at={T.base} out={T.flavors - 0.7} x={at("base")[0]} y={at("base")[1]} label="Base" size={size} flip={L.portrait} />
      <Callout at={T.body} out={T.printFrom - 0.05} x={(a.body ?? [-999, -999])[0]} y={(a.body ?? [-999, -999])[1]} label={`${BRAND.volume} can`} size={size} />
      <Callout at={T.printFrom + 0.1} out={T.flavors - 0.7} x={at("body")[0]} y={at("body")[1]} label="Label" size={size} flip={L.portrait} />
      <Callout at={T.lid} out={T.flavors - 0.7} x={at("lid")[0]} y={at("lid")[1]} label="Lid" size={size} flip={L.portrait} />
      <Callout at={T.tab} out={T.flavors - 0.7} x={at("tab")[0]} y={at("tab")[1]} label="Stay-on tab" size={size} flip={!L.portrait} />
    </AbsoluteFill>
  );
};

const Flavors: React.FC = () => {
  const L = useLayout();
  return (
    <>
      {FLAVORS.map((f, i) => {
        const s = flavorAt(i);
        // old content out before the swap, new content in after it (no double exposure)
        const at = s + (i === 0 ? 0.35 : 0.3);
        const out = s + FLAVOR_SLOT - 0.45;
        return (
          <div key={f.slug} style={L.column}>
            <Rise at={at - 0.05} out={out}>
              <div style={{ display: "flex", gap: 1.4 * L.u, alignItems: "center", marginBottom: 2.6 * L.u }}>
                <Chip size={L.mono} color={f.accent}>
                  0{i + 1} / 0{FLAVORS.length}
                </Chip>
                {f.edition ? (
                  <Chip size={L.mono} filled>
                    {f.edition}
                  </Chip>
                ) : null}
              </div>
            </Rise>
            <Title lines={f.lines} at={at} out={out} size={L.title} accent={f.accent} maxWidth={L.colWidth} />
            <Rise at={at + 0.35} out={out}>
              <div style={{ ...BODY, fontSize: L.body, color: "rgba(244,246,250,0.92)", marginTop: 2.6 * L.u, maxWidth: L.portrait ? undefined : 40 * L.u * 1.78, lineHeight: 1.3, textShadow: "0 0.05em 0.4em rgba(0,0,0,0.35)" }}>
                {f.taste}
              </div>
            </Rise>
          </div>
        );
      })}
    </>
  );
};

const Inside: React.FC = () => {
  const L = useLayout();
  return (
    <>
      {BENEFITS.slice(0, 3).map((b, i) => {
        const s = benefitAt(i);
        const at = s + (i === 0 ? 0.45 : 0.2);
        const out = s + 2 - 0.35;
        const words = b.title.toUpperCase().split(" ");
        const lines = words.length > 1 ? [words[0], words.slice(1).join(" ")] : [b.title.toUpperCase()];
        return (
          <div key={b.title} style={L.column}>
            <Rise at={at - 0.05} out={out}>
              <div style={{ marginBottom: 2.6 * L.u }}>
                <Chip size={L.mono} color={BRAND_BLUE}>
                  In every can · 0{i + 1}
                </Chip>
              </div>
            </Rise>
            <Title lines={lines} at={at} out={out} size={L.title * 0.92} accent="#9fd6ff" maxWidth={L.colWidth} />
            <Rise at={at + 0.3} out={out}>
              <div style={{ ...MONO, fontSize: L.mono * 1.2, color: "#f4f6fa", marginTop: 2.6 * L.u, letterSpacing: "0.2em" }}>{b.spec}</div>
            </Rise>
          </div>
        );
      })}
    </>
  );
};

const Zamzam: React.FC = () => {
  const L = useLayout();
  const at = T.zamzam + 0.35;
  const out = T.halal - 0.35;
  return (
    <div style={L.column}>
      <Rise at={at} out={out} distance={18}>
        <div style={{ fontFamily: "Amiri", fontWeight: 700, fontSize: L.title * 1.15, color: GOLD, lineHeight: 1.1, marginBottom: "0.18em", direction: "rtl", textAlign: "left", textShadow: "0 0 0.4em rgba(233,194,122,0.35)" }}>
          زمزم
        </div>
      </Rise>
      <Title lines={["ADDED", "ZAMZAM WATER"]} at={at + 0.25} out={out} size={L.title * (L.portrait ? 0.78 : 0.66)} accent={GOLD} maxWidth={L.colWidth} />
      <Rise at={at + 0.6} out={out}>
        <div style={{ ...BODY, fontSize: L.body, color: "rgba(244,246,250,0.92)", marginTop: 2.4 * L.u }}>{ZAMZAM_LINE}</div>
      </Rise>
    </div>
  );
};

const Halal: React.FC = () => {
  const L = useLayout();
  return (
    <div style={L.column}>
      <Title lines={["HALAL", "CERTIFIED"]} at={T.halal + 0.3} out={T.crack - 0.35} size={L.title} accent="#f4f6fa" maxWidth={L.colWidth} />
      <Rise at={T.halal + 0.6} out={T.crack - 0.35}>
        <div style={{ ...MONO, fontSize: L.mono * 1.15, color: "#f4f6fa", marginTop: 2.6 * L.u }}>{BRAND.origin}</div>
      </Rise>
    </div>
  );
};

const Crack: React.FC = () => {
  const L = useLayout();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: L.portrait ? 14 * L.u : 8 * L.u }}>
      <Rise at={T.pop + 0.3} out={T.finale - 0.5}>
        <div style={{ ...MONO, fontSize: L.mono * 1.2, color: "#f4f6fa" }}>{BRAND.storage.split(".")[0]}.</div>
      </Rise>
    </AbsoluteFill>
  );
};

const Finale: React.FC = () => {
  const L = useLayout();
  const t = useTime();
  const lock = T.lockup;
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: L.portrait ? 13 * L.u : 6.5 * L.u }}>
      {t < lock + 0.2 ? (
        <Title lines={["FUEL YOUR", "WILD SIDE"]} at={T.finale + 0.45} out={lock - 0.3} size={L.portrait ? L.title * 1.05 : L.title * 0.95} accent={BRAND_BLUE} align="center" maxWidth={L.width * 0.8} />
      ) : null}
      {t >= lock - 0.1 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...DISPLAY, fontSize: L.portrait ? 13 * L.u : 8.6 * L.u, lineHeight: 0.86, textAlign: "center" }}>
            <div style={{ color: "#f4f6fa" }}>
              <Letters text={BRAND.wordmark[0]} at={lock} out={T.end + 1} stagger={0.035} />
            </div>
            <div style={{ color: BRAND_BLUE, marginLeft: "0.6em" }}>
              <Letters text={BRAND.wordmark[1]} at={lock + 0.15} out={T.end + 1} stagger={0.035} />
            </div>
          </div>
          <Rise at={lock + 0.55} out={T.end + 1}>
            <div style={{ fontFamily: "Libre Franklin", fontWeight: 700, fontSize: L.mono * 1.05, letterSpacing: "0.55em", paddingLeft: "0.55em", color: "#f4f6fa", marginTop: 2.0 * L.u }}>
              {BRAND.tagline.toUpperCase()}
            </div>
          </Rise>
          <Rise at={lock + 0.95} out={T.end + 1}>
            <div style={{ ...MONO, fontSize: L.mono * 0.95, color: "rgba(244,246,250,0.78)", marginTop: 1.6 * L.u, letterSpacing: "0.22em" }}>
              {FLAVORS.length} flavors · Halal certified · {BRAND.origin}
            </div>
          </Rise>
          <Rise at={lock + 1.3} out={T.end + 1}>
            <div style={{ marginTop: 2.2 * L.u }}>
              <Chip size={L.mono * 1.05} filled>
                {SITE}
              </Chip>
            </div>
          </Rise>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ───────────────────────── composition ─────────────────────────

export const Film: React.FC<{ variant: "16x9" | "9x16" }> = ({ variant }) => {
  useFonts();
  const anchors = useAnchors(variant);
  const { fps } = useVideoConfig();
  const t = useTime();
  const f = (s: number) => Math.round(s * fps);
  const corners = useWindow(T.reveal, T.end - 0.4, 0.6);
  const fadeOut = interpolate(t, [T.end - 0.7, T.end - 0.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const fadeIn = interpolate(t, [0, 0.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video src={staticFile(`plate-${variant}.mp4`)} muted />
      <Corners opacity={corners * 0.8} />
      <Sequence name="Hook"  durationInFrames={f(T.reveal)} layout="absolute-fill">
        <Hook />
      </Sequence>
      <Sequence name="Reveal" durationInFrames={f(T.build)} layout="absolute-fill">
        <Reveal />
      </Sequence>
      <Sequence name="Build" durationInFrames={f(T.flavors)} layout="absolute-fill">
        <Build anchors={anchors} />
      </Sequence>
      <Sequence name="Flavors" durationInFrames={f(T.inside)} layout="absolute-fill">
        <Flavors />
      </Sequence>
      <Sequence name="Inside" durationInFrames={f(T.zamzam)} layout="absolute-fill">
        <Inside />
      </Sequence>
      <Sequence name="Zamzam" durationInFrames={f(T.halal)} layout="absolute-fill">
        <Zamzam />
      </Sequence>
      <Sequence name="Halal" durationInFrames={f(T.crack)} layout="absolute-fill">
        <Halal />
      </Sequence>
      <Sequence name="Crack" durationInFrames={f(T.finale)} layout="absolute-fill">
        <Crack />
      </Sequence>
      <Sequence name="Finale" durationInFrames={f(T.end)} layout="absolute-fill">
        <Finale />
      </Sequence>
      {/* light over the big cuts: night → studio, build → colour, → Zamzam dawn, crack → finale */}
      <Sequence name="Leak build" from={f(T.build - 0.35)} durationInFrames={f(0.9)} layout="absolute-fill">
        <LightLeak seed={3} hueShift={190} opacity={0.55} />
      </Sequence>
      <Sequence name="Leak flavors" from={f(T.flavors - 0.3)} durationInFrames={f(0.9)} layout="absolute-fill">
        <LightLeak seed={7} hueShift={200} opacity={0.5} />
      </Sequence>
      <Sequence name="Leak zamzam" from={f(T.zamzam - 0.35)} durationInFrames={f(1.0)} layout="absolute-fill">
        <LightLeak seed={11} hueShift={0} opacity={0.55} />
      </Sequence>
      <Sequence name="Leak finale" from={f(T.finale - 0.35)} durationInFrames={f(1.0)} layout="absolute-fill">
        <LightLeak seed={5} hueShift={200} opacity={0.35} />
      </Sequence>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: Math.max(fadeIn, fadeOut) }} />
      <Audio src={staticFile("grizzly-film-mix.wav")} />
    </AbsoluteFill>
  );
};
