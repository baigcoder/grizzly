import { BRAND, GRIZZLY_FLAVORS } from './brand';

/**
 * The brand film (/film). The cut, its chapters and the files are made by video/ (see video/README.md): the chapter
 * times are the film's cue sheet (video/src/timeline.ts) and the thumbnails are written by video/web-assets.mjs at the
 * same moments. Words on the page come from grizzly.json, like everything in the film.
 */

export interface FilmChapter {
  id: string;
  title: string;
  /** What happens in the chapter, as shown in the film. */
  line: string;
  start: number;
  end: number;
  /** The chapter's colour on the scrub bar: a flavor accent (data) or a design token (CSS var). */
  accent: string;
}

const accent = (slug: string) => GRIZZLY_FLAVORS.find((flavor) => flavor.slug === slug)?.accent ?? 'var(--color-accent)';
const NIGHT = accent('blue-raspberry');
const ZAMZAM_GOLD = 'var(--color-zamzam-gold)';
const METAL = 'var(--color-floor-high)';
const WHITE = 'var(--color-white)';

export const FILM = {
  title: `${BRAND.name}: the film`,
  duration: 50,
  teaserDuration: 20,
  /** First published on the site (also the VideoObject upload date). */
  published: '2026-10-24',
  sources: {
    landscape: '/film/film-16x9.mp4',
    portrait: '/film/film-9x16.mp4',
    teaserLandscape: '/film/teaser-16x9.mp4',
    teaserPortrait: '/film/teaser-9x16.mp4',
  },
  posters: {
    landscape: '/film/poster-16x9.webp',
    portrait: '/film/poster-9x16.webp',
    teaserPortrait: '/film/teaser-poster-9x16.webp',
  },
  /** Approximate sizes of the downloads, shown on the buttons. */
  sizes: { landscape: '28 MB', portrait: '33 MB', teaserLandscape: '13 MB', teaserPortrait: '15 MB' },
} as const;

export const FILM_CHAPTERS: FilmChapter[] = [
  { id: 'hook', title: 'The roar', line: 'Night falls on the range and the bear rises behind the can.', start: 0, end: 3, accent: NIGHT },
  { id: 'reveal', title: 'Grizzly Energy', line: `A ${BRAND.volume} energy drink, ${BRAND.origin.toLowerCase()}.`, start: 3, end: 6, accent: NIGHT },
  { id: 'build', title: 'The can', line: 'Base, body, label, lid and the stay-on tab, each landing on the beat.', start: 6, end: 12, accent: METAL },
  {
    id: 'flavors',
    title: 'Six flavors',
    line: GRIZZLY_FLAVORS.map((flavor) => flavor.name).join(' · '),
    start: 12,
    end: 30,
    accent: accent('mango-fuego'),
  },
  { id: 'inside', title: 'In every can', line: 'Natural caffeine, electrolytes from sea salt and B vitamins.', start: 30, end: 36, accent: NIGHT },
  { id: 'zamzam', title: 'Zamzam water', line: 'Every can is made with added Zamzam water.', start: 36, end: 39, accent: ZAMZAM_GOLD },
  { id: 'halal', title: 'Halal certified', line: `Halal certified. ${BRAND.origin}.`, start: 39, end: 41, accent: WHITE },
  { id: 'crack', title: 'The crack', line: `${BRAND.storage.split('.')[0]}.`, start: 41, end: 44, accent: NIGHT },
  { id: 'finale', title: BRAND.tagline, line: 'All six, lit one by one.', start: 44, end: 50, accent: accent('blackout-berry') },
];

export const chapterThumb = (id: string) => `/film/chapters/${id}.webp`;

/** Index of the chapter playing at `time` (seconds). */
export const chapterAt = (time: number) => {
  const index = FILM_CHAPTERS.findIndex((chapter) => time >= chapter.start && time < chapter.end);
  return index < 0 ? FILM_CHAPTERS.length - 1 : index;
};

/** 0:07 style timecode. */
export const timecode = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
