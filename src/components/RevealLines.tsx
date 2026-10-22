import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// (the prerender has no layout: there the plain paragraph stays)
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface RevealLinesProps {
  text: string;
  className?: string;
}

/**
 * A paragraph whose lines drop into place one after another, each behind its own mask, when an ancestor carries
 * .is-active (as the reference's chapter copy). The lines are the ones the browser actually wraps: the words are laid
 * out once, grouped by their top edge, and grouped again when the paragraph's width changes. Until then (and in the
 * prerendered page) it is the plain paragraph; once split, assistive tech reads one hidden copy of the sentence.
 */
export const RevealLines: React.FC<RevealLinesProps> = ({ text, className = '' }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);

  useClientLayoutEffect(() => {
    const paragraph = ref.current;
    if (!paragraph) return;
    let width = -1;
    const split = () => {
      if (paragraph.clientWidth === width) return;
      width = paragraph.clientWidth;
      // measure: one span per word in a hidden twin with the paragraph's own width and type
      const probe = paragraph.cloneNode(false) as HTMLParagraphElement;
      probe.removeAttribute('id');
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '0', top: '0', width: `${width}px` });
      const words = text.split(' ');
      words.forEach((word, index) => {
        const span = document.createElement('span');
        span.textContent = index < words.length - 1 ? `${word} ` : word;
        probe.appendChild(span);
      });
      paragraph.parentElement?.appendChild(probe);
      const grouped: string[] = [];
      let lastTop = Number.NaN;
      Array.from(probe.children).forEach((span, index) => {
        const top = (span as HTMLElement).offsetTop;
        if (top !== lastTop) grouped.push(words[index]);
        else grouped[grouped.length - 1] += ` ${words[index]}`;
        lastTop = top;
      });
      probe.remove();
      setLines(grouped);
    };
    split();
    const observer = new ResizeObserver(split);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [text]);

  return (
    <p ref={ref} className={`reveal-lines ${className}`}>
      {lines && <span className="sr-only">{text}</span>}
      {lines
        ? lines.map((line, index) => (
            <span className="reveal-lines__mask" key={index} aria-hidden="true">
              <span className="reveal-lines__line" style={{ '--l': index } as React.CSSProperties}>
                {line}
              </span>
              {index < lines.length - 1 ? ' ' : null}
            </span>
          ))
        : text}
    </p>
  );
};
