import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { decodePng, diffImages, encodePng } from "../lib/png.js";

const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
};

const pngOf = ({ width, height, colorType, bpp, rows, filters, extra = [] }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, colorType, 0, 0, 0], 8);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const [pa, pb, pc] = [a, b, c].map((v) => Math.abs(p - v));
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const filtered = rows.map((row, y) => {
    const prev = rows[y - 1];
    const out = row.map((v, x) => {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= bpp ? prev[x - bpp] : 0;
      const base = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filters[y]];
      return (v - base + 256) & 255;
    });
    return [filters[y], ...out];
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", deflateSync(Buffer.from(filtered.flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("encodePng output decodes to the same RGBA pixels", () => {
  const data = Buffer.from([...Array(4 * 6)].map((_, i) => (i * 37) % 256));
  const back = decodePng(encodePng({ width: 3, height: 2, data }));
  expect([back.width, back.height]).toEqual([3, 2]);
  expect(back.data.equals(data)).toBe(true);
});

test("decodePng undoes every row filter on RGB rows", () => {
  const rows = [...Array(5)].map((_, y) => [...Array(12)].map((_, x) => (x * 50 + y * 90) % 256));
  const png = pngOf({ width: 4, height: 5, colorType: 2, bpp: 3, rows, filters: [0, 1, 2, 3, 4] });
  const { data } = decodePng(png);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 4; x++) {
      const o = (y * 4 + x) * 4;
      expect([...data.subarray(o, o + 4)]).toEqual([...rows[y].slice(x * 3, x * 3 + 3), 255]);
    }
  }
});

test("decodePng expands palette and transparency", () => {
  const plte = chunk("PLTE", Buffer.from([10, 20, 30, 200, 100, 50]));
  const trns = chunk("tRNS", Buffer.from([0]));
  const png = pngOf({
    width: 2,
    height: 1,
    colorType: 3,
    bpp: 1,
    rows: [[1, 0]],
    filters: [0],
    extra: [plte, trns],
  });
  expect([...decodePng(png).data]).toEqual([200, 100, 50, 255, 10, 20, 30, 0]);
});

test("decodePng rejects files it cannot read", () => {
  expect(() => decodePng(Buffer.from("hello, not a png"))).toThrow("not a PNG file");
});

test("diffImages counts differing pixels over the threshold and bounds them", () => {
  const blank = () => ({ width: 4, height: 3, data: Buffer.alloc(48, 255) });
  const a = blank();
  const b = blank();
  b.data.set([0, 0, 0], (1 * 4 + 2) * 4);
  b.data.set([250, 250, 250], (2 * 4 + 3) * 4);
  const exact = diffImages(a, b);
  expect(exact).toMatchObject({ differingPixels: 2, totalPixels: 12, percent: 16.6667 });
  expect(exact.region).toEqual([
    [2, 1],
    [3, 2],
  ]);
  expect([...exact.image.data.subarray(24, 28)]).toEqual([255, 0, 0, 255]);
  expect(diffImages(a, b, 10)).toMatchObject({ differingPixels: 1 });
  expect(diffImages(a, a)).toMatchObject({ differingPixels: 0, region: null });
  expect(() => diffImages(a, { ...b, width: 2, height: 6 })).toThrow(
    "images differ in size: 4x3 vs 2x6",
  );
});
