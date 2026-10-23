import React, { useEffect, useState } from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, staticFile, useVideoConfig } from "remotion";
import { BRAND, BRAND_BLUE, FLAVORS, GOLD, SITE, T, flavorAt } from "./brand";
import { DISPLAY, MONO, fontsReady } from "./fonts";
import { Chip, Corners, Letters, LightLeak, Rise, Title, useTime } from "./type";
import { useLayout } from "./Film";

/**
 * The 20 s brag cut (brag-slim, cinematic tone): hook → reveal → six flavors on the beat → Zamzam and halal → the
 * crack → the lock-up. Edited from the full film's 3D plate; every cut lands on a beat of the 120 BPM score.
 */

/** [start in the cut, source time in the plate, length] in seconds. */
export const BRAG_EDIT: Array<{ name: string; at: number; src: number; len: number }> = [
  { name: "Hook", at: 0, src: 0.0, len: 3.0 },
  { name: "Wordmark", at: 3.0, src: 3.6, len: 1.0 },
  { name: "Lid and tab", at: 4.0, src: 9.2, len: 1.0 },
  ...FLAVORS.map((f, i) => ({ name: f.name, at: 5 + i, src: flavorAt(i) + (i === 0 ? 0.7 : 0.5), len: 1.0 })),
  { name: "Zamzam", at: 11.0, src: T.zamzam + 0.3, len: 2.0 },
  { name: "Halal", at: 13.0, src: T.halal + 0.5, len: 1.0 },
  { name: "Crack", at: 14.0, src: T.pop - 0.4, len: 1.5 },
  { name: "Finale", at: 15.5, src: T.finale, len: 4.5 },
];
export const BRAG_DURATION = 20;

const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    fontsReady.then(() => continueRender(handle));
  }, [handle]);
};

export const Brag: React.FC<{ variant: "16x9" | "9x16" }> = ({ variant }) => {
  useFonts();
  const L = useLayout();
  const { fps } = useVideoConfig();
  const t = useTime();
  const f = (s: number) => Math.round(s * fps);
  const fadeOut = interpolate(t, [BRAG_DURATION - 0.5, BRAG_DURATION - 0.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lock = 16.9;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {BRAG_EDIT.map((cut) => (
        <Sequence key={cut.name} name={cut.name} from={f(cut.at)} durationInFrames={f(cut.len)} layout="absolute-fill">
          <Video src={staticFile(`plate-${variant}.mp4`)} trimBefore={f(cut.src)} muted />
        </Sequence>
      ))}
      <Corners opacity={0.7} />
      {/* hook */}
      <div style={L.column}>
        <Title lines={["FUEL YOUR", "WILD SIDE"]} at={1.5} out={2.75} size={L.title * 1.05} accent={BRAND_BLUE} maxWidth={L.colWidth} />
      </div>
      {/* the flavor names, one per beat pair */}
      {FLAVORS.map((fl, i) => (
        <div key={fl.slug} style={L.column}>
          <Rise at={5 + i + 0.02} out={5 + i + 0.78} distance={18}>
            <div style={{ marginBottom: 2 * L.u }}>
              <Chip size={L.mono} color={fl.accent}>
                0{i + 1} / 0{FLAVORS.length}
              </Chip>
            </div>
          </Rise>
          <Title lines={fl.lines} at={5 + i + 0.02} out={5 + i + 0.8} size={L.title} accent={fl.accent} maxWidth={L.colWidth} />
        </div>
      ))}
      {/* Zamzam + halal */}
      <div style={L.column}>
        <Rise at={11.25} out={12.7} distance={16}>
          <div style={{ fontFamily: "Amiri", fontWeight: 700, fontSize: L.title * 1.1, color: GOLD, lineHeight: 1.1, marginBottom: "0.18em" }}>زمزم</div>
        </Rise>
        <Title lines={["ADDED", "ZAMZAM WATER"]} at={11.4} out={12.7} size={L.title * (L.portrait ? 0.78 : 0.66)} accent={GOLD} maxWidth={L.colWidth} />
      </div>
      <div style={L.column}>
        <Title lines={["HALAL", "CERTIFIED"]} at={13.05} out={13.8} size={L.title} accent="#f4f6fa" maxWidth={L.colWidth} />
      </div>
      {/* lock-up */}
      <AbsoluteFill style={{ alignItems: "center", paddingTop: L.portrait ? 13 * L.u : 6.5 * L.u }}>
        {t < lock ? <Title lines={["FUEL YOUR", "WILD SIDE"]} at={15.6} out={lock - 0.3} size={L.title * 0.95} accent={BRAND_BLUE} align="center" maxWidth={L.width * 0.8} /> : null}
        {t >= lock - 0.05 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...DISPLAY, fontSize: L.portrait ? 13 * L.u : 8.6 * L.u, lineHeight: 0.86, textAlign: "center" }}>
              <div style={{ color: "#f4f6fa" }}>
                <Letters text={BRAND.wordmark[0]} at={lock} out={30} stagger={0.03} />
              </div>
              <div style={{ color: BRAND_BLUE, marginLeft: "0.6em" }}>
                <Letters text={BRAND.wordmark[1]} at={lock + 0.12} out={30} stagger={0.03} />
              </div>
            </div>
            <Rise at={lock + 0.5} out={30}>
              <div style={{ ...MONO, fontSize: L.mono * 0.95, color: "rgba(244,246,250,0.8)", marginTop: 2.4 * L.u, letterSpacing: "0.22em" }}>
                Halal certified · {BRAND.origin}
              </div>
            </Rise>
            <Rise at={lock + 0.8} out={30}>
              <div style={{ marginTop: 3 * L.u }}>
                <Chip size={L.mono * 1.15} filled>
                  {SITE}
                </Chip>
              </div>
            </Rise>
          </div>
        ) : null}
      </AbsoluteFill>
      <Sequence name="Leak" from={f(10.75)} durationInFrames={f(0.8)} layout="absolute-fill">
        <LightLeak seed={11} hueShift={0} opacity={0.5} />
      </Sequence>
      <Sequence name="Leak finale" from={f(15.2)} durationInFrames={f(0.9)} layout="absolute-fill">
        <LightLeak seed={5} hueShift={200} opacity={0.5} />
      </Sequence>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut }} />
      <Audio src={staticFile("grizzly-brag-mix.wav")} />
    </AbsoluteFill>
  );
};
