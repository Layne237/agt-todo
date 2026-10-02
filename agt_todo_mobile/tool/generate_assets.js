/**
 * Generates the mobile app's binary assets from code (no design tools needed):
 *  - launcher icon sources for flutter_launcher_icons (same alarm-clock ✓ as the web app)
 *  - splash image for flutter_native_splash
 *  - Android notification small icons (white silhouette, per density)
 *  - the alarm sound (same two-tone 880/660 Hz chirp as the web alarm), as WAV
 *
 *   node tool/generate_assets.js
 *   dart run flutter_launcher_icons && dart run flutter_native_splash:create
 */

const fs = require('fs');
const path = require('path');
const { render, iconSample, badgeSample, roundedBg } = require('../../scripts/generate-icons.js');

const ROOT = path.join(__dirname, '..');
const write = (rel, buffer) => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    console.log(`✅ ${rel} (${buffer.length} bytes)`);
};

// Scales the drawing around the centre: k > 1 shrinks it.
const scaled = (fn, k) => (x, y) => fn(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k);

// ---------- Icons ----------

// Full-bleed icon: iOS (which rounds corners itself) and legacy Android launchers.
write('assets/images/logo.png', render(1024, (x, y) => iconSample(x, y, null)));
// Adaptive icon foreground: white silhouette inside the 66% safe zone, on a #6366f1 background layer.
write('assets/images/logo_foreground.png', render(1024, scaled(badgeSample, 1.45)));
// Splash: rounded icon, centred on the dark background.
write('assets/images/splash.png', render(512, (x, y) => iconSample(x, y, roundedBg)));

// Notification small icon (status bar): Android only uses the alpha channel.
const densities = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
for (const [density, size] of Object.entries(densities)) {
    write(`android/app/src/main/res/drawable-${density}/ic_stat_alarm.png`, render(size, scaled(badgeSample, 1.1)));
}

// ---------- Alarm sound ----------

function wav(samples, sampleRate) {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);      // PCM chunk size
    header.writeUInt16LE(1, 20);       // PCM
    header.writeUInt16LE(1, 22);       // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/** Band-limited square wave (odd harmonics) - the web alarm's "square" oscillator, minus the aliasing. */
function square(freq, t) {
    let v = 0;
    for (let h = 1; h <= 9; h += 2) v += Math.sin(2 * Math.PI * freq * h * t) / h;
    return v * (4 / Math.PI);
}

/**
 * One 700 ms ring cycle, like the web app: 880 Hz then 660 Hz bursts of 160 ms,
 * 180 ms apart, with a 20 ms attack and exponential decay.
 */
function alarmCycles(cycles, sampleRate) {
    const cycleLen = Math.round(0.7 * sampleRate);
    const out = new Float32Array(cycleLen * cycles);
    for (let c = 0; c < cycles; c++) {
        [[880, 0], [660, 0.18]].forEach(([freq, offset]) => {
            const start = c * cycleLen + Math.round(offset * sampleRate);
            const len = Math.round(0.16 * sampleRate);
            for (let i = 0; i < len; i++) {
                const t = i / sampleRate;
                const env = t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 18);
                out[start + i] += square(freq, t) * env * 0.45;
            }
        });
    }
    return out;
}

const SAMPLE_RATE = 44100;
const sound = wav(alarmCycles(4, SAMPLE_RATE), SAMPLE_RATE); // 2.8 s, loops seamlessly
write('assets/sounds/alarm.wav', sound);
// Notification channel sound (Android plays it in a loop thanks to FLAG_INSISTENT).
write('android/app/src/main/res/raw/alarm.wav', sound);
