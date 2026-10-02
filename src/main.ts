// Browser platform entry point: canvas setup, main loop, wiring of input,
// audio and bundled content into the App.

import { App } from './app/App';
import { Sfx } from './audio/Sfx';
import { ContentLibrary } from './content/library';
import { loadContentPack } from './content/loader';
import { InputManager } from './input/InputManager';
import { bundledPackFiles } from './platform/web/bundledContent';
import { browserStorage } from './platform/web/storage';
import { VIEW_H, VIEW_W } from './rendering/theme';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

// Thin black border kept around the game, as a share of the window's shorter side.
const SCREEN_MARGIN = 0.015;

let scale = 1;
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const margin = Math.round(Math.min(window.innerWidth, window.innerHeight) * SCREEN_MARGIN);
  // Fill the window as far as the 16:9 view allows (free scaling), minus the margin.
  scale = Math.max(0.1, Math.min((window.innerWidth - 2 * margin) / VIEW_W, (window.innerHeight - 2 * margin) / VIEW_H));
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  canvas.width = Math.floor(VIEW_W * scale * dpr);
  canvas.height = Math.floor(VIEW_H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const loaded = loadContentPack(bundledPackFiles().base ?? {});
const sfx = new Sfx();
// Bundled content + content saved by the developer editor (/editor) in this browser.
const library = loaded.ok ? new ContentLibrary(loaded.pack, browserStorage()) : null;
const app = new App(library, loaded.ok ? [] : loaded.errors, sfx);
const input = new InputManager();
input.onGamepadDisconnected = (player) => app.pause(player ? `${player === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} CONTROLLER DISCONNECTED` : 'CONTROLLER DISCONNECTED');

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  if (e.code === 'F3') {
    e.preventDefault();
    app.ui.debug = !app.ui.debug;
  }
});

const toLogical = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
};
canvas.addEventListener('mousemove', (e) => {
  const p = toLogical(e);
  app.pointerMove(p.x, p.y);
});
canvas.addEventListener('mousedown', (e) => {
  const p = toLogical(e);
  app.click(p.x, p.y);
});
canvas.focus();

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  app.frame(input.poll(now), dt);
  app.render(ctx, now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Exposed for debugging in the browser console only.
(window as unknown as { psychopomp: App }).psychopomp = app;
