/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import headersFile from '../../public/_headers?raw';
import vercelConfig from '../../vercel.json';

/**
 * The response headers live in two files: public/_headers (Netlify, Cloudflare Pages) and vercel.json (Vercel, which
 * ignores _headers). The CSP in them is what lets WebGL and the KTX2 transcoder run, so they must say the same thing.
 */
type Rules = Record<string, Record<string, string>>;

function netlifyRules(): Rules {
  const rules: Rules = {};
  let path = '';
  headersFile
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line.trim() || line.trimStart().startsWith('#')) return;
      if (!/^\s/.test(line)) {
        path = line.trim();
        rules[path] = {};
        return;
      }
      const colon = line.indexOf(':');
      rules[path][line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    });
  return rules;
}

function vercelRules(): Rules {
  const rules: Rules = {};
  vercelConfig.headers.forEach(({ source, headers }) => {
    // Vercel's path patterns, written back in _headers' wildcard form
    const path = source.replace('(.*)\\.html', '*.html').replace('(.*)', '*');
    rules[path] = Object.fromEntries(headers.map(({ key, value }) => [key, value]));
  });
  return rules;
}

describe('host headers', () => {
  it('vercel.json carries exactly the rules in public/_headers', () => {
    expect(vercelRules()).toEqual(netlifyRules());
  });

  it('allows WebGL texture transcoding (wasm) and nothing from other origins', () => {
    const csp = netlifyRules()['/*']['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("default-src 'self'");
  });
});
