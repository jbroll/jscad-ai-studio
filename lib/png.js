import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

const unfilter = (data, width, height, bpp) => {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? out[row + x - bpp] : 0;
      const up = y > 0 ? out[prev + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[prev + x - bpp] : 0;
      const base = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (base === undefined) throw new Error(`unsupported PNG row filter ${filter}`);
      out[row + x] = (data[src + x] + base) & 255;
    }
  }
  return out;
};

// Decodes 8-bit, non-interlaced PNGs (what Chromium and most tools write) to RGBA.
export const decodePng = (buf) => {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let header;
  let palette;
  let transparency;
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = body;
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR chunk");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colorType, , , interlace] = header.subarray(8, 13);
  const channels = CHANNELS[colorType];
  if (depth !== 8 || !channels || interlace) {
    throw new Error(
      `unsupported PNG: bit depth ${depth}, color type ${colorType}, interlace ${interlace}`,
    );
  }
  const raw = unfilter(inflateSync(Buffer.concat(idat)), width, height, channels);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const px = raw.subarray(i * channels, (i + 1) * channels);
    let rgb;
    let alpha = 255;
    if (colorType === 3) {
      rgb = palette.subarray(px[0] * 3, px[0] * 3 + 3);
      if (transparency && px[0] < transparency.length) alpha = transparency[px[0]];
    } else if (channels <= 2) {
      rgb = [px[0], px[0], px[0]];
      if (channels === 2) alpha = px[1];
    } else {
      rgb = px;
      if (channels === 4) alpha = px[3];
    }
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = alpha;
  }
  return { width, height, data: rgba };
};

const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
};

export const encodePng = ({ width, height, data }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// A pixel differs when any RGBA channel differs by more than `threshold`. The
// diff image paints differing pixels red over a faded grayscale copy of `a`.
export const diffImages = (a, b, threshold = 0) => {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`images differ in size: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const { width, height } = a;
  const out = Buffer.alloc(width * height * 4);
  let differing = 0;
  const min = [Infinity, Infinity];
  const max = [-1, -1];
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    let delta = 0;
    for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[o + c] - b.data[o + c]));
    if (delta > threshold) {
      differing++;
      out.set([255, 0, 0, 255], o);
      const x = i % width;
      const y = Math.floor(i / width);
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
    } else {
      const lum = 0.299 * a.data[o] + 0.587 * a.data[o + 1] + 0.114 * a.data[o + 2];
      const faded = Math.round(255 - (255 - lum) * 0.3);
      out.set([faded, faded, faded, 255], o);
    }
  }
  return {
    width,
    height,
    differingPixels: differing,
    totalPixels: width * height,
    percent: Math.round((differing / (width * height)) * 1e6) / 1e4,
    region: differing ? [min, max] : null,
    image: { width, height, data: out },
  };
};
