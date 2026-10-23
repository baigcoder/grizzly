import { Composition, Folder } from "remotion";
import { Film } from "./Film";
import { Brag } from "./Brag";

/**
 * Grizzly Energy films. The 3D plates (public/plate-*.mp4) and callout anchors come from video/render.mjs; the mixes
 * (public/grizzly-*-mix.wav) from video/audio/synth.mjs. 30 fps, 120 BPM.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Full-film">
        <Composition id="GrizzlyFilm" component={Film} durationInFrames={1500} fps={30} width={1920} height={1080} defaultProps={{ variant: "16x9" as const }} />
        <Composition id="GrizzlyFilmVertical" component={Film} durationInFrames={1500} fps={30} width={1080} height={1920} defaultProps={{ variant: "9x16" as const }} />
      </Folder>
      <Folder name="Brag-cut">
        <Composition id="GrizzlyBrag" component={Brag} durationInFrames={600} fps={30} width={1920} height={1080} defaultProps={{ variant: "16x9" as const }} />
        <Composition id="GrizzlyBragVertical" component={Brag} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={{ variant: "9x16" as const }} />
      </Folder>
    </>
  );
};
