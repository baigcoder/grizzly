import './film.css';
import { FilmScene } from './scene';
import { Director, DURATION } from './shots';
import { FPS } from './timeline';

/**
 * The 3D plate page. ?w=1920&h=1080 sets the frame. The page exposes window.film for render.mjs:
 *   await film.ready; film.seek(t) → poses and renders time t (motion blur included); film.anchors() → callout
 *   anchors at t, for the Remotion type layer. Without ?render it plays in real time; ?t=12.5 holds one moment.
 * The type in front of the product is not drawn here: it is the Remotion composition in film/.
 */
const params = new URLSearchParams(location.search);
const width = Number(params.get('w') ?? 1920);
const height = Number(params.get('h') ?? 1080);

const frame = document.getElementById('frame')!;
frame.style.width = `${width}px`;
frame.style.height = `${height}px`;
const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

const scene = new FilmScene(canvas, width, height);
const director = new Director(scene);
const pose = (time: number) => director.update(time);

function seek(t: number, samples = director.samplesAt(t)) {
  scene.render(t, FPS, samples, pose);
  // leave the scene posed at t itself, so the anchors belong to the frame's centre
  director.update(t);
}

const ready = (async () => {
  await Promise.all([document.fonts.load('italic 900 100px "Libre Franklin"'), document.fonts.ready]);
  await scene.loadCans([0]);
  // compile every program and upload every texture before the first captured frame
  for (const t of [0.5, 2, 4, 8, 10, 13, 20, 31, 37, 40, 42.8, 46]) seek(t, 1);
  scene.renderer.compile(scene.scene, scene.camera);
})();

(window as unknown as { film: unknown }).film = { ready, seek, duration: DURATION, anchors: () => director.frame.anchors };

if (!params.has('render')) {
  void ready.then(() => {
    const fixed = params.get('t');
    if (fixed !== null) return seek(Number(fixed));
    const start = performance.now();
    const loop = () => {
      seek(((performance.now() - start) / 1000) % DURATION, 1);
      requestAnimationFrame(loop);
    };
    loop();
  });
}
