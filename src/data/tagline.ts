/** "Fuel your wild side" → ["Fuel your", "wild side"] for the two-line tagline type. */
export function splitTagline(tagline: string): string[] {
  const words = tagline.split(' ');
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}
