/**
 * A scroll-driven CSS custom property, written only on the few elements that read it. Set on <html> it was
 * inherited by every element on the page, so each scroll frame re-styled the whole document (the main cost of
 * scrolling on phones). Elements are found once and found again when the page changes (`refresh`, or when one has
 * left the page); an unchanged value is never rewritten.
 */
export function scrollVar(name: string, selector: string) {
  let elements: HTMLElement[] = [];
  let value = '';
  const refresh = () => {
    elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    elements.forEach((element) => element.style.setProperty(name, value));
  };
  return {
    set(next: string) {
      const stale = elements.length === 0 || !elements[0].isConnected;
      if (next === value && !stale) return;
      value = next;
      if (stale) refresh();
      else elements.forEach((element) => element.style.setProperty(name, next));
    },
    refresh,
    clear() {
      elements.forEach((element) => element.style.removeProperty(name));
      elements = [];
      value = '';
    },
  };
}
