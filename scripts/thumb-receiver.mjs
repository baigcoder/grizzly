#!/usr/bin/env node
/**
 * Saves the can renders posted by scripts/thumb-studio.html into assets_label-art/thumbs/<slug>.png.
 * Localhost only; stops by itself after the six flavors (or Ctrl+C).
 *   node scripts/thumb-receiver.mjs
 */
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets_label-art/thumbs');
const EXPECTED = Number(process.argv[2] ?? 6); // node scripts/thumb-receiver.mjs [count]
let saved = 0;

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  response.setHeader('Access-Control-Allow-Methods', 'POST');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const name = decodeURIComponent((request.url ?? '').slice(1));
  if (request.method !== 'POST' || !/^[a-z-]+\.png$/.test(name)) {
    response.writeHead(request.method === 'OPTIONS' ? 204 : 400).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  await writeFile(resolve(out, name), Buffer.concat(chunks));
  console.log(`saved ${name}`);
  response.writeHead(204).end();
  if (++saved >= EXPECTED) server.close();
});
server.listen(8788, '127.0.0.1', () => console.log('waiting for renders on http://127.0.0.1:8788'));
