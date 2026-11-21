/**
 * Fired on `window` whenever the storage notice publishes, changes or clears its height (--notice-h). The hero HUD is
 * anchored to the bottom edge and rises by that height, so the flavor title moves *without resizing*: no
 * ResizeObserver fires, and the 3D hero can, which is fitted to sit clear of that title, would keep its old fit and
 * end up behind the title and slider.
 */
export const NOTICE_LAYOUT_EVENT = 'grizzly:notice-layout';
