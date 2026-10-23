import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND } from '../data/brand';
import { FILM, FILM_CHAPTERS, chapterAt, chapterThumb, timecode } from '../data/film';
import { prefersReducedMotion } from '../hooks/useSmoothScroll';
import { ButtonLabel } from './ButtonLabel';
import '../styles/film.css';

/**
 * The brand film page (/film): the 50 s film in a theatre player with chapter-coloured scrubbing, a chapter rail that
 * follows playback, the 20 s teaser on a phone, the press kit (downloads, share, caption) and the way to the shop.
 *
 * Trigger: the route. Persists: nothing. State-driven: play, mute, chapter (re-renders only when the chapter changes;
 * the playhead and timecode are written to the DOM through refs every frame). DOM only, no WebGL: the page sits on the
 * plain-page backdrop and the 3D scene does not draw. Optional: the teaser autoplays muted while in view, never under
 * reduced motion. Fallback: native video controls if the custom ones fail; the files are plain MP4 (H.264/AAC).
 */

const isPortraitScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;

const Icon: React.FC<{ name: 'play' | 'pause' | 'sound' | 'muted' | 'expand' | 'download' | 'share' | 'copy' }> = ({ name }) => {
  const paths: Record<typeof name, React.ReactNode> = {
    play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
    pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />,
    sound: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    muted: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    expand: <path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    download: <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    share: <path d="M12 15V4.5M8 8.5l4-4 4 4M6 12.5v6h12v-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    copy: <path d="M9 9h10v10H9zM5 15V5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  };
  return (
    <svg className="film-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
};

// ───────────────────────── the theatre player ─────────────────────────

interface PlayerHandle {
  seek: (seconds: number, play?: boolean) => void;
}

const FilmPlayer = React.forwardRef<PlayerHandle, { onChapter: (index: number) => void }>(({ onChapter }, ref) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const [portrait] = useState(isPortraitScreen);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [idle, setIdle] = useState(false);
  const chapterRef = useRef(0);
  const idleTimer = useRef(0);

  // playhead → CSS variable and timecode, every frame while playing; React only hears about chapter changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const paint = () => {
      const t = video.currentTime;
      const p = Math.min(1, t / (video.duration || FILM.duration));
      shellRef.current?.style.setProperty('--film-progress', p.toFixed(4));
      if (timeRef.current) timeRef.current.textContent = timecode(t);
      if (scrubRef.current && document.activeElement !== scrubRef.current) scrubRef.current.value = String(t);
      const index = chapterAt(t);
      if (index !== chapterRef.current) {
        chapterRef.current = index;
        onChapter(index);
      }
    };
    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
      cancelAnimationFrame(frame);
      loop();
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      paint();
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onPause);
    video.addEventListener('seeked', paint);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onPause);
      video.removeEventListener('seeked', paint);
    };
  }, [onChapter]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const seek = useCallback((seconds: number, play = false) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, seconds), (video.duration || FILM.duration) - 0.05);
    if (play && video.paused) void video.play().catch(() => undefined);
  }, []);
  React.useImperativeHandle(ref, () => ({ seek }), [seek]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const fullscreen = () => {
    const shell = shellRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (shell?.requestFullscreen) void shell.requestFullscreen().catch(() => video?.webkitEnterFullscreen?.());
    else video?.webkitEnterFullscreen?.(); // iOS Safari: the native player
  };

  // controls fade while the film plays and the pointer rests
  const wake = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2400);
  };
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    const video = videoRef.current;
    if (!video) return;
    const keys: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      ArrowRight: () => seek(video.currentTime + 5),
      ArrowLeft: () => seek(video.currentTime - 5),
      m: toggleMute,
      f: fullscreen,
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
      wake();
    }
  };

  return (
    <div
      ref={shellRef}
      className={`film-player ${portrait ? 'film-player--portrait' : ''} ${playing ? 'is-playing' : ''} ${started ? 'is-started' : ''} ${playing && idle ? 'is-idle' : ''}`}
      onPointerMove={wake}
      onKeyDown={onKey}
    >
      <video
        ref={videoRef}
        className="film-player__video"
        src={portrait ? FILM.sources.portrait : FILM.sources.landscape}
        poster={portrait ? FILM.posters.portrait : FILM.posters.landscape}
        preload="metadata"
        playsInline
        onClick={toggle}
        aria-label={`${FILM.title}. A ${FILM.duration} second product film with music and no dialogue; every chapter is listed below the player.`}
      />
      <span className="film-player__corners" aria-hidden="true" />

      {!started && (
        <button type="button" className="film-player__start" onClick={toggle} aria-label="Play the film">
          <span className="film-player__start-ring">
            <Icon name="play" />
          </span>
          <span className="film-player__start-label">
            Play the film <span className="film-player__start-time">{timecode(FILM.duration)}</span>
          </span>
        </button>
      )}

      <div className="film-player__bar">
        <button type="button" className="film-player__button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <div className="film-player__track">
          <div className="film-player__chapters" aria-hidden="true">
            {FILM_CHAPTERS.map((chapter) => (
              <span
                key={chapter.id}
                className="film-player__segment"
                style={{ '--seg-start': chapter.start / FILM.duration, '--seg-size': (chapter.end - chapter.start) / FILM.duration, '--seg-accent': chapter.accent } as React.CSSProperties}
              />
            ))}
          </div>
          <input
            ref={scrubRef}
            className="film-player__scrub"
            type="range"
            min={0}
            max={FILM.duration}
            step={0.1}
            defaultValue={0}
            aria-label="Position in the film"
            aria-valuetext="Film position"
            onInput={(event) => seek(Number(event.currentTarget.value))}
          />
        </div>
        <span className="film-player__time" aria-hidden="true">
          <span ref={timeRef}>0:00</span> / {timecode(FILM.duration)}
        </span>
        <button type="button" className="film-player__button" onClick={toggleMute} aria-label={muted ? 'Sound on' : 'Mute'} aria-pressed={muted}>
          <Icon name={muted ? 'muted' : 'sound'} />
        </button>
        <button type="button" className="film-player__button" onClick={fullscreen} aria-label="Full screen">
          <Icon name="expand" />
        </button>
      </div>
    </div>
  );
});
FilmPlayer.displayName = 'FilmPlayer';

// ───────────────────────── the teaser on a phone ─────────────────────────

const PhoneTeaser: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [withSound, setWithSound] = useState(false);
  const [running, setRunning] = useState(false);

  // plays muted while on screen (never under reduced motion), pauses when it scrolls away
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().then(() => setRunning(true)).catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.45 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = withSound;
    if (!withSound) {
      video.currentTime = 0;
      void video.play().then(() => setRunning(true)).catch(() => undefined);
    }
    setWithSound(!withSound);
  };

  return (
    <div className="film-phone">
      <div className="film-phone__device">
        <video
          ref={videoRef}
          className="film-phone__video"
          src={FILM.sources.teaserPortrait}
          poster={FILM.posters.teaserPortrait}
          muted
          loop
          playsInline
          preload="none"
          aria-label={`The ${FILM.teaserDuration} second teaser in the vertical format`}
        />
        <span className="film-phone__notch" aria-hidden="true" />
      </div>
      <button type="button" className="chip film-phone__sound" onClick={toggleSound} aria-pressed={withSound}>
        <Icon name={withSound ? 'sound' : 'muted'} />
        {withSound ? 'Sound on' : running ? 'Play with sound' : 'Play the teaser'}
      </button>
    </div>
  );
};

// ───────────────────────── the page ─────────────────────────

const shareCaption = `${BRAND.name}: six flavors, with natural caffeine from green coffee beans, electrolytes from sea salt, B vitamins and added Zamzam water in every can. Halal certified, ${BRAND.origin.toLowerCase()}. ${BRAND.tagline}.`;

export const FilmPage: React.FC<{ onNavigate: (url: string) => void }> = ({ onNavigate }) => {
  const playerRef = useRef<PlayerHandle>(null);
  const [chapter, setChapter] = useState(0);
  const [copied, setCopied] = useState<'link' | 'caption' | null>(null);
  const railRef = useRef<HTMLOListElement>(null);

  // keep the playing chapter in view in the rail (horizontal on phones)
  useEffect(() => {
    const item = railRef.current?.children[chapter] as HTMLElement | undefined;
    const rail = railRef.current;
    if (!item || !rail || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({ left: item.offsetLeft - rail.clientWidth / 2 + item.clientWidth / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [chapter]);

  const copy = async (what: 'link' | 'caption') => {
    const text = what === 'link' ? window.location.href : shareCaption;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: FILM.title, text: shareCaption, url: window.location.href });
        return;
      } catch {
        // dismissed: nothing to do
        return;
      }
    }
    void copy('link');
  };

  const downloads: Array<{ href: string; label: string; detail: string }> = [
    { href: FILM.sources.landscape, label: 'Film · 16:9', detail: `${timecode(FILM.duration)} · 1920×1080 · ${FILM.sizes.landscape}` },
    { href: FILM.sources.portrait, label: 'Film · 9:16', detail: `${timecode(FILM.duration)} · 1080×1920 · ${FILM.sizes.portrait}` },
    { href: FILM.sources.teaserLandscape, label: 'Teaser · 16:9', detail: `${timecode(FILM.teaserDuration)} · 1920×1080 · ${FILM.sizes.teaserLandscape}` },
    { href: FILM.sources.teaserPortrait, label: 'Teaser · 9:16', detail: `${timecode(FILM.teaserDuration)} · 1080×1920 · ${FILM.sizes.teaserPortrait}` },
  ];

  return (
    <article className="film-page" aria-labelledby="film-title">
      <header className="film-page__head">
        <p className="film-page__eyebrow">
          <span className="film-page__index">Film</span>
          <span className="film-page__rule" aria-hidden="true" />
          {timecode(FILM.duration)} · 16:9 and 9:16
        </p>
        <h1 id="film-title" className="display film-page__title">
          <span>Fuel your</span> <span className="film-page__title-accent">wild side</span>
        </h1>
        <p className="film-page__lead">
          {BRAND.name} in {FILM.duration} seconds: the can, built part by part; six flavors; what goes into every can; and the crack. Made from the
          same 3D can, labels and night as this site.
        </p>
      </header>

      <section className="film-page__theatre" aria-label="The film">
        <FilmPlayer ref={playerRef} onChapter={setChapter} />
      </section>

      <section className="film-page__chapters" aria-labelledby="film-chapters-title">
        <h2 id="film-chapters-title" className="film-page__section-title">
          <span className="film-page__index">01</span> Chapters
        </h2>
        <ol ref={railRef} className="film-rail">
          {FILM_CHAPTERS.map((item, index) => (
            <li key={item.id} className={`film-rail__item ${index === chapter ? 'is-current' : ''}`} style={{ '--chapter-accent': item.accent } as React.CSSProperties}>
              <button
                type="button"
                className="film-rail__button"
                onClick={() => playerRef.current?.seek(item.start + 0.01, true)}
                aria-current={index === chapter ? 'step' : undefined}
                aria-label={`Play from ${timecode(item.start)}: ${item.title}`}
              >
                <span className="film-rail__thumb">
                  <img src={chapterThumb(item.id)} alt="" loading="lazy" decoding="async" width={640} height={360} />
                  <span className="film-rail__time">{timecode(item.start)}</span>
                </span>
                <span className="film-rail__meta">
                  <span className="film-rail__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="film-rail__title">{item.title}</span>
                </span>
                <span className="film-rail__line">{item.line}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="film-page__formats" aria-labelledby="film-formats-title">
        <div className="film-page__formats-copy">
          <h2 id="film-formats-title" className="film-page__section-title">
            <span className="film-page__index">02</span> Made for every screen
          </h2>
          <p className="display film-page__big">
            {FILM.teaserDuration} seconds.
            <br />
            <span className="film-page__title-accent">Vertical.</span>
          </p>
          <p className="film-page__text">
            A {FILM.teaserDuration} second teaser cut on the beat for Reels, TikTok and Shorts, and the full film in both 16:9 and 9:16. The
            type sits inside every platform's safe area, and the first frame is the line-up, so the thumbnail sells the range.
          </p>
          <ul className="film-page__specs">
            <li>Film · {timecode(FILM.duration)}</li>
            <li>Teaser · {timecode(FILM.teaserDuration)}</li>
            <li>1920×1080 · 1080×1920</li>
            <li>30 fps · stereo</li>
          </ul>
        </div>
        <PhoneTeaser />
      </section>

      <section className="film-page__press" aria-labelledby="film-press-title">
        <h2 id="film-press-title" className="film-page__section-title">
          <span className="film-page__index">03</span> Press kit
        </h2>
        <div className="film-press">
          <ul className="film-press__files">
            {downloads.map((file) => (
              <li key={file.href}>
                <a className="film-press__file" href={file.href} download>
                  <Icon name="download" />
                  <span className="film-press__label">{file.label}</span>
                  <span className="film-press__detail">{file.detail}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="film-press__share">
            <p className="film-press__caption">{shareCaption}</p>
            <div className="film-press__actions">
              <button type="button" className="chip" onClick={() => void copy('caption')}>
                <Icon name="copy" />
                {copied === 'caption' ? 'Caption copied' : 'Copy caption'}
              </button>
              <button type="button" className="chip" onClick={() => void share()}>
                <Icon name="share" />
                {copied === 'link' ? 'Link copied' : 'Share the film'}
              </button>
            </div>
            <p className="film-press__status" role="status" aria-live="polite">
              {copied === 'link' ? 'The link to this page is on your clipboard.' : copied === 'caption' ? 'The caption is on your clipboard.' : ''}
            </p>
          </div>
        </div>
      </section>

      <section className="film-page__end" aria-label={BRAND.tagline}>
        <p className="display film-page__end-title">
          {BRAND.wordmark[0]} <span className="film-page__title-accent">{BRAND.wordmark[1]}</span>
        </p>
        <a
          className="button-primary"
          href="/shop"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('/shop');
          }}
        >
          <ButtonLabel>Shop the six flavors</ButtonLabel>
        </a>
      </section>
    </article>
  );
};
