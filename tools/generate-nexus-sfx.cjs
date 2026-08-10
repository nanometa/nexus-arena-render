const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'audio', 'nexus');

let seed = 0x4e455855;

function randomSigned() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
}

function createBuffer(duration) {
  const length = Math.ceil(duration * SAMPLE_RATE);
  return {
    left: new Float64Array(length),
    right: new Float64Array(length),
  };
}

function envelope(progress, attack = 0.02, release = 0.45, curve = 1.7) {
  const attackGain = Math.min(1, progress / Math.max(attack, 0.0001));
  const releaseStart = 1 - release;
  const releaseGain = progress < releaseStart
    ? 1
    : Math.max(0, (1 - progress) / Math.max(release, 0.0001));
  return Math.pow(attackGain * releaseGain, curve);
}

function panGains(pan = 0) {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function addTone(buffer, options) {
  const {
    start = 0,
    duration,
    frequency,
    endFrequency = frequency,
    gain,
    attack = 0.01,
    release = 0.65,
    curve = 1.6,
    pan = 0,
    harmonic = 0.08,
  } = options;
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const [leftGain, rightGain] = panGains(pan);
  let phase = 0;

  for (let index = 0; index < sampleCount && startIndex + index < buffer.left.length; index += 1) {
    const progress = index / Math.max(1, sampleCount - 1);
    const currentFrequency = frequency * Math.pow(endFrequency / frequency, progress);
    phase += (Math.PI * 2 * currentFrequency) / SAMPLE_RATE;
    const body = Math.sin(phase) + harmonic * Math.sin(phase * 2.003);
    const sample = body * gain * envelope(progress, attack, release, curve);
    buffer.left[startIndex + index] += sample * leftGain;
    buffer.right[startIndex + index] += sample * rightGain;
  }
}

function addNoise(buffer, options) {
  const {
    start = 0,
    duration,
    gain,
    attack = 0.01,
    release = 0.65,
    curve = 1.5,
    pan = 0,
    lowpass = 0.2,
    highpass = 0,
  } = options;
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const [leftGain, rightGain] = panGains(pan);
  let low = 0;
  let highLow = 0;

  for (let index = 0; index < sampleCount && startIndex + index < buffer.left.length; index += 1) {
    const progress = index / Math.max(1, sampleCount - 1);
    const white = randomSigned();
    low += (white - low) * lowpass;
    highLow += (low - highLow) * highpass;
    const colored = highpass > 0 ? low - highLow : low;
    const sample = colored * gain * envelope(progress, attack, release, curve);
    buffer.left[startIndex + index] += sample * leftGain;
    buffer.right[startIndex + index] += sample * rightGain;
  }
}

function addImpact(buffer, start, gain = 1, pan = 0) {
  addNoise(buffer, {
    start,
    duration: 0.075,
    gain: 0.7 * gain,
    attack: 0.002,
    release: 0.96,
    curve: 2.1,
    lowpass: 0.24,
    pan,
  });
  addTone(buffer, {
    start,
    duration: 0.48,
    frequency: 72,
    endFrequency: 42,
    gain: 0.6 * gain,
    attack: 0.002,
    release: 0.96,
    curve: 2,
    harmonic: 0.16,
    pan,
  });
  addTone(buffer, {
    start: start + 0.006,
    duration: 0.23,
    frequency: 176,
    endFrequency: 94,
    gain: 0.2 * gain,
    attack: 0.002,
    release: 0.94,
    curve: 2.3,
    harmonic: 0.05,
    pan,
  });
}

function addDelay(buffer, seconds, amount, crossfeed = 0.12) {
  const delay = Math.floor(seconds * SAMPLE_RATE);
  for (let index = delay; index < buffer.left.length; index += 1) {
    const leftSource = buffer.left[index - delay];
    const rightSource = buffer.right[index - delay];
    buffer.left[index] += leftSource * amount + rightSource * amount * crossfeed;
    buffer.right[index] += rightSource * amount + leftSource * amount * crossfeed;
  }
}

function finish(buffer, ceiling = 0.88, roomAmount = 0.1) {
  if (roomAmount > 0) addDelay(buffer, 0.071, roomAmount, 0.18);
  let peak = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    buffer.left[index] = Math.tanh(buffer.left[index] * 1.08);
    buffer.right[index] = Math.tanh(buffer.right[index] * 1.08);
    peak = Math.max(peak, Math.abs(buffer.left[index]), Math.abs(buffer.right[index]));
  }
  const scale = peak > 0 ? ceiling / peak : 1;
  for (let index = 0; index < buffer.left.length; index += 1) {
    buffer.left[index] *= scale;
    buffer.right[index] *= scale;
  }
  return buffer;
}

function createSelect() {
  const buffer = createBuffer(0.13);
  addNoise(buffer, { duration: 0.024, gain: 0.22, release: 0.99, curve: 3.1, lowpass: 0.18, highpass: 0.045, pan: -0.08 });
  addNoise(buffer, { start: 0.006, duration: 0.062, gain: 0.14, attack: 0.08, release: 0.88, curve: 2.1, lowpass: 0.07, highpass: 0.012, pan: 0.1 });
  addNoise(buffer, { start: 0.027, duration: 0.028, gain: 0.09, release: 0.98, curve: 2.8, lowpass: 0.22, highpass: 0.06, pan: 0.16 });
  return finish(buffer, 0.46, 0);
}

function createDraw() {
  const buffer = createBuffer(0.58);
  addNoise(buffer, { duration: 0.4, gain: 0.36, attack: 0.08, release: 0.66, curve: 1.2, lowpass: 0.075, highpass: 0.012, pan: -0.2 });
  addNoise(buffer, { start: 0.08, duration: 0.34, gain: 0.25, attack: 0.28, release: 0.5, curve: 1.15, lowpass: 0.2, highpass: 0.045, pan: 0.22 });
  addNoise(buffer, { start: 0.37, duration: 0.075, gain: 0.34, release: 0.94, curve: 2.2, lowpass: 0.16 });
  addTone(buffer, { start: 0.38, duration: 0.18, frequency: 112, endFrequency: 78, gain: 0.13, release: 0.94 });
  return finish(buffer, 0.78);
}

function createPlace() {
  const buffer = createBuffer(0.36);
  addNoise(buffer, { duration: 0.14, gain: 0.25, attack: 0.24, release: 0.72, curve: 1.25, lowpass: 0.08, highpass: 0.014, pan: -0.18 });
  addNoise(buffer, { start: 0.072, duration: 0.055, gain: 0.52, attack: 0.018, release: 0.97, curve: 2.8, lowpass: 0.15, highpass: 0.022, pan: 0.05 });
  addNoise(buffer, { start: 0.083, duration: 0.13, gain: 0.19, attack: 0.012, release: 0.92, curve: 2.15, lowpass: 0.052, pan: -0.03 });
  addNoise(buffer, { start: 0.108, duration: 0.035, gain: 0.16, release: 0.99, curve: 3, lowpass: 0.24, highpass: 0.075, pan: 0.16 });
  addTone(buffer, { start: 0.078, duration: 0.17, frequency: 142, endFrequency: 104, gain: 0.045, release: 0.97, curve: 2.5, harmonic: 0.025 });
  return finish(buffer, 0.72, 0.018);
}

function createFlip() {
  const buffer = createBuffer(0.54);
  addNoise(buffer, { duration: 0.34, gain: 0.4, attack: 0.42, release: 0.48, curve: 1.15, lowpass: 0.085, highpass: 0.015, pan: -0.22 });
  addNoise(buffer, { start: 0.035, duration: 0.32, gain: 0.31, attack: 0.33, release: 0.54, curve: 1.15, lowpass: 0.18, highpass: 0.05, pan: 0.24 });
  addNoise(buffer, { start: 0.3, duration: 0.075, gain: 0.54, release: 0.97, curve: 2.5, lowpass: 0.24 });
  addTone(buffer, { start: 0.305, duration: 0.2, frequency: 138, endFrequency: 76, gain: 0.18, release: 0.95, curve: 2.1 });
  return finish(buffer, 0.8);
}

function createCapture() {
  const buffer = createBuffer(1.18);
  addImpact(buffer, 0, 1.1);
  addNoise(buffer, { duration: 0.16, gain: 0.78, release: 0.98, curve: 2.35, lowpass: 0.3 });
  addTone(buffer, { start: 0.018, duration: 0.95, frequency: 55, endFrequency: 38, gain: 0.48, release: 0.95, curve: 1.7, harmonic: 0.2 });
  [116, 174, 232].forEach((frequency, index) => {
    addTone(buffer, { start: 0.04 + index * 0.018, duration: 0.78 - index * 0.08, frequency, endFrequency: frequency * 0.86, gain: 0.11 - index * 0.02, attack: 0.008, release: 0.94, pan: index % 2 ? 0.3 : -0.3 });
  });
  addNoise(buffer, { start: 0.16, duration: 0.75, gain: 0.17, attack: 0.28, release: 0.7, curve: 1.3, lowpass: 0.055, highpass: 0.009, pan: -0.25 });
  addNoise(buffer, { start: 0.23, duration: 0.64, gain: 0.13, attack: 0.3, release: 0.68, curve: 1.35, lowpass: 0.08, highpass: 0.018, pan: 0.28 });
  addDelay(buffer, 0.19, 0.2, 0.4);
  return finish(buffer, 0.9);
}

function createSacrifice() {
  const buffer = createBuffer(1.05);
  addNoise(buffer, { duration: 0.78, gain: 0.25, attack: 0.46, release: 0.48, curve: 1.1, lowpass: 0.045, highpass: 0.008, pan: -0.2 });
  addNoise(buffer, { start: 0.08, duration: 0.72, gain: 0.18, attack: 0.42, release: 0.5, curve: 1.1, lowpass: 0.075, highpass: 0.02, pan: 0.25 });
  addTone(buffer, { start: 0.18, duration: 0.8, frequency: 164, endFrequency: 48, gain: 0.27, attack: 0.2, release: 0.74, curve: 1.45, harmonic: 0.15 });
  addImpact(buffer, 0.72, 0.55);
  addDelay(buffer, 0.145, 0.18, 0.35);
  return finish(buffer, 0.84);
}

function createVictory() {
  const buffer = createBuffer(2.45);
  addImpact(buffer, 0, 0.8);
  addNoise(buffer, { start: 0.08, duration: 1.95, gain: 0.13, attack: 0.38, release: 0.56, curve: 1.2, lowpass: 0.045, highpass: 0.008 });
  [[0.08, 146.83], [0.34, 220], [0.62, 293.66], [0.92, 369.99]].forEach(([start, frequency], index) => {
    addTone(buffer, { start, duration: 1.25, frequency, endFrequency: frequency * 1.004, gain: 0.16 + index * 0.015, attack: 0.07, release: 0.72, pan: index % 2 ? 0.22 : -0.22, harmonic: 0.13 });
    addTone(buffer, { start, duration: 1.35, frequency: frequency / 2, gain: 0.09, attack: 0.06, release: 0.78, pan: index % 2 ? -0.18 : 0.18, harmonic: 0.16 });
  });
  addDelay(buffer, 0.238, 0.19, 0.42);
  return finish(buffer, 0.88);
}

function createDefeat() {
  const buffer = createBuffer(2.25);
  addImpact(buffer, 0, 0.94);
  addNoise(buffer, { start: 0.12, duration: 1.8, gain: 0.14, attack: 0.3, release: 0.64, curve: 1.25, lowpass: 0.04, highpass: 0.007 });
  [[0.04, 146.83], [0.44, 130.81], [0.83, 98]].forEach(([start, frequency], index) => {
    addTone(buffer, { start, duration: 1.18, frequency, endFrequency: frequency * 0.82, gain: 0.2 + index * 0.025, attack: 0.05, release: 0.82, pan: index % 2 ? 0.2 : -0.2, harmonic: 0.17 });
  });
  addDelay(buffer, 0.226, 0.2, 0.38);
  return finish(buffer, 0.88);
}

function createDrawResult() {
  const buffer = createBuffer(1.85);
  addImpact(buffer, 0, 0.48);
  [[110, -0.2], [146.83, 0.2], [196, 0]].forEach(([frequency, pan], index) => {
    addTone(buffer, { start: 0.08 + index * 0.05, duration: 1.5, frequency, endFrequency: frequency * 0.98, gain: 0.17 - index * 0.02, attack: 0.12, release: 0.75, pan, harmonic: 0.12 });
  });
  addDelay(buffer, 0.21, 0.18, 0.4);
  return finish(buffer, 0.82);
}

function writeWav(filePath, buffer) {
  const channels = 2;
  const bytesPerSample = 2;
  const dataLength = buffer.left.length * channels * bytesPerSample;
  const output = Buffer.alloc(44 + dataLength);

  output.write('RIFF', 0);
  output.writeUInt32LE(36 + dataLength, 4);
  output.write('WAVE', 8);
  output.write('fmt ', 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
  output.writeUInt16LE(channels * bytesPerSample, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < buffer.left.length; index += 1) {
    const offset = 44 + index * 4;
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buffer.left[index])) * 32767), offset);
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buffer.right[index])) * 32767), offset + 2);
  }

  fs.writeFileSync(filePath, output);
}

const sounds = {
  select: createSelect,
  draw: createDraw,
  place: createPlace,
  flip: createFlip,
  capture: createCapture,
  sacrifice: createSacrifice,
  victory: createVictory,
  defeat: createDefeat,
  'draw-result': createDrawResult,
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

Object.entries(sounds).forEach(([name, create]) => {
  seed = 0x4e455855 ^ name.length;
  const filePath = path.join(OUTPUT_DIR, `${name}.wav`);
  writeWav(filePath, create());
  const size = Math.round(fs.statSync(filePath).size / 1024);
  process.stdout.write(`${name}.wav ${size} KB\n`);
});
