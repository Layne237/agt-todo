/**
 * Generates the PWA icons (alarm clock with a checkmark) as PNG files.
 * Pure Node.js - no image libraries needed.
 *
 *   node scripts/generate-icons.js
 *
 * Shapes are described as signed distance functions and rasterised with
 * 4x4 supersampling for anti-aliasing.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'assets');

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
}

function encodePNG(width, height, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// ---------- Signed distance functions (coords in 0..1) ----------

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

function capsule(ax, ay, bx, by, r) {
    return (x, y) => {
        const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
        const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
        return Math.hypot(pax - bax * h, pay - bay * h) - r;
    };
}

function roundedRect(cx, cy, hw, hh, r) {
    return (x, y) => {
        const qx = Math.abs(x - cx) - hw + r;
        const qy = Math.abs(y - cy) - hh + r;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    };
}

const union = (...fns) => (x, y) => Math.min(...fns.map(f => f(x, y)));

// ---------- The alarm-clock drawing ----------

const WHITE = [255, 255, 255, 255];
const INDIGO_TOP = [99, 102, 241];    // #6366f1 (theme colour)
const INDIGO_BOTTOM = [79, 70, 229];  // #4f46e5

const CX = 0.5, CY = 0.54;
const bells = union(circle(0.30, 0.29, 0.085), circle(0.70, 0.29, 0.085));
const legs = union(capsule(0.37, 0.76, 0.31, 0.83, 0.03), capsule(0.63, 0.76, 0.69, 0.83, 0.03));
const face = circle(CX, CY, 0.25);
const faceGap = circle(CX, CY, 0.285); // background-coloured ring separating bells from the face
const check = union(capsule(0.395, 0.55, 0.465, 0.62, 0.034), capsule(0.465, 0.62, 0.615, 0.465, 0.034));

function backgroundColor(y) {
    return INDIGO_TOP.map((c, i) => Math.round(c + (INDIGO_BOTTOM[i] - c) * y)).concat(255);
}

/** Colour of a single sample for the full-colour icon. */
function iconSample(x, y, bgShape) {
    if (bgShape && bgShape(x, y) > 0) return [0, 0, 0, 0];
    const bg = backgroundColor(y);
    if (face(x, y) <= 0) return check(x, y) <= 0 ? bg : WHITE;
    if (faceGap(x, y) <= 0) return bg;
    if (bells(x, y) <= 0 || legs(x, y) <= 0) return WHITE;
    return bg;
}

/** Monochrome badge: white silhouette on transparent (Android uses the alpha channel only). */
function badgeSample(x, y) {
    // Scale the drawing up a little so it fills the small badge.
    const sx = 0.5 + (x - 0.5) * 0.82;
    const sy = 0.53 + (y - 0.5) * 0.82;
    if (face(sx, sy) <= 0) return check(sx, sy) <= 0 ? [0, 0, 0, 0] : WHITE;
    if (faceGap(sx, sy) <= 0) return [0, 0, 0, 0];
    if (bells(sx, sy) <= 0 || legs(sx, sy) <= 0) return WHITE;
    return [0, 0, 0, 0];
}

function render(size, sampleFn) {
    const SS = 4;
    const out = Buffer.alloc(size * size * 4);
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const c = sampleFn((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
                    // Premultiply so transparent samples don't darken edges.
                    r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
                }
            }
            const i = (py * size + px) * 4;
            out[i] = a ? Math.round(r / a) : 0;
            out[i + 1] = a ? Math.round(g / a) : 0;
            out[i + 2] = a ? Math.round(b / a) : 0;
            out[i + 3] = Math.round(a / (SS * SS));
        }
    }
    return encodePNG(size, size, out);
}

const roundedBg = roundedRect(0.5, 0.5, 0.5, 0.5, 0.22);

const targets = [
    // "any" purpose icons: rounded corners
    { file: 'icon-192.png', size: 192, fn: (x, y) => iconSample(x, y, roundedBg) },
    { file: 'icon-512.png', size: 512, fn: (x, y) => iconSample(x, y, roundedBg) },
    // "maskable" icons + Apple touch icon: full bleed (the OS applies its own mask)
    { file: 'icon-maskable-192.png', size: 192, fn: (x, y) => iconSample(x, y, null) },
    { file: 'icon-maskable-512.png', size: 512, fn: (x, y) => iconSample(x, y, null) },
    { file: 'apple-touch-icon.png', size: 180, fn: (x, y) => iconSample(x, y, null) },
    // Notification badge (status bar icon on Android)
    { file: 'badge.png', size: 96, fn: badgeSample }
];

// Reused by agt_todo_mobile/tool/generate_assets.js for the Flutter app icons.
module.exports = { render, iconSample, badgeSample, roundedBg };

if (require.main === module) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const t of targets) {
        const png = render(t.size, t.fn);
        fs.writeFileSync(path.join(OUT_DIR, t.file), png);
        console.log(`✅ ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
    }
}
