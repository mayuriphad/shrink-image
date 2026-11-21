import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { shrinkImage } from '../dist/index.js';

// A minimal stand-in for the browser APIs shrinkImage uses. The encoded size grows with the
// pixel count and the quality, which is enough to drive the compression loop.
let nextImage = { width: 4000, height: 3000 };
let supportedTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);
let ops = [];

class FakeImage {
  set src(_url) {
    this.naturalWidth = nextImage.width;
    this.naturalHeight = nextImage.height;
    queueMicrotask(() => this.onload());
  }
}

function fakeCanvas() {
  const ctx = {
    fillRect: () => ops.push(`fill:${ctx.fillStyle}`),
    drawImage: (_img, _x, _y, w, h) => ops.push(`draw:${w}x${h}`),
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob(callback, type, quality) {
      const actualType = supportedTypes.has(type) ? type : 'image/png';
      const bytesPerPixel = actualType === 'image/png' ? 3 : 2 * quality;
      const size = Math.round(this.width * this.height * bytesPerPixel);
      ops.push(`encode:${actualType}:${quality}:${this.width}x${this.height}`);
      callback(new Blob([new Uint8Array(size)], { type: actualType }));
    },
  };
}

globalThis.Image = FakeImage;
globalThis.document = { createElement: () => fakeCanvas() };

const photo = (bytes = 15 * 1024 * 1024, name = 'IMG_0001.HEIC') =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

beforeEach(() => {
  nextImage = { width: 4000, height: 3000 };
  supportedTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);
  ops = [];
});

test('shrinkImage - scales down after quality bottoms out until maxSizeMB is met', async () => {
  const maxSizeMB = 0.3;
  const result = await shrinkImage(photo(), { maxSizeMB, maxWidthOrHeight: 1920 });

  assert.ok(result.size <= maxSizeMB * 1024 * 1024, `result is ${result.size} bytes`);
  assert.equal(result.type, 'image/webp');
  assert.equal(result.name, 'IMG_0001.webp');
  // It lowered quality first, then reduced the dimensions
  assert.ok(ops.some((op) => op.startsWith('encode:image/webp:0.5:1920x1440')));
  assert.ok(ops.some((op) => /^draw:(\d+)x/.exec(op) && Number(/^draw:(\d+)x/.exec(op)[1]) < 1920));
});

test('shrinkImage - stops at minWidthOrHeight even if the size is still too large', async () => {
  const result = await shrinkImage(photo(), { maxSizeMB: 0.001, minWidthOrHeight: 400 });
  assert.ok(ops.at(-1).endsWith(':400x300'), ops.at(-1));
  assert.ok(result.size > 0.001 * 1024 * 1024);
});

test('shrinkImage - falls back to JPEG when the browser cannot encode WebP', async () => {
  supportedTypes = new Set(['image/jpeg', 'image/png']);
  const result = await shrinkImage(photo(), { maxSizeMB: 1 });

  assert.equal(result.type, 'image/jpeg');
  assert.equal(result.name, 'IMG_0001.jpg');
  assert.ok(!ops.some((op) => op.startsWith('encode:image/png') && op === ops.at(-1)));
});

test('shrinkImage - fills a background before drawing JPEG output', async () => {
  await shrinkImage(photo(), { outputType: 'image/jpeg', backgroundColor: '#fafafa' });
  const fill = ops.indexOf('fill:#fafafa');
  assert.ok(fill !== -1 && fill < ops.findIndex((op) => op.startsWith('draw:')));

  ops = [];
  await shrinkImage(photo(), { outputType: 'image/webp' });
  assert.ok(!ops.some((op) => op.startsWith('fill:')));
});

test('shrinkImage - PNG output is scaled down without quality steps', async () => {
  await shrinkImage(photo(), { outputType: 'image/png', maxSizeMB: 1 });
  const encodes = ops.filter((op) => op.startsWith('encode:'));
  const sizes = encodes.map((op) => op.split(':').at(-1));
  assert.equal(new Set(sizes).size, sizes.length, 'every PNG encode uses new dimensions');
});

test('shrinkImage - keeps a small original that compression would make larger', async () => {
  nextImage = { width: 800, height: 600 };
  const small = photo(10 * 1024, 'avatar.jpg');
  assert.equal(await shrinkImage(small, { maxSizeMB: 1 }), small);

  const converted = await shrinkImage(small, { maxSizeMB: 1, keepSmallerOriginal: false });
  assert.equal(converted.type, 'image/webp');
});

test('shrinkImage - rejects a non-positive maxSizeMB', async () => {
  await assert.rejects(shrinkImage(photo(), { maxSizeMB: 0 }), RangeError);
});
