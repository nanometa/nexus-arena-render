import { Howl, Howler } from 'howler';

const SAMPLE_RATE = 22050;
const MASTER_VOLUME = 0.72;
const sounds = new Map();
const scheduledSounds = new Set();

let seed = 0x4e455855;

function randomSigned() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
}

function envelope(time, duration, attack = 0.015, release = 0.35) {
  const attackGain = Math.min(1, time / Math.max(attack, 0.001));
  const releaseStart = duration * (1 - release);
  const releaseGain = time < releaseStart ? 1 : Math.max(0, (duration - time) / Math.max(duration - releaseStart, 0.001));
  return attackGain * releaseGain;
}

function addTone(samples, options) {
  const {
    start = 0,
    duration,
    frequency,
    endFrequency = frequency,
    gain,
    attack = 0.012,
    release = 0.45,
    warmth = 0.18,
  } = options;
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  let phase = 0;

  for (let index = 0; index < sampleCount && startIndex + index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = index / Math.max(1, sampleCount - 1);
    const currentFrequency = frequency + (endFrequency - frequency) * progress;
    phase += (Math.PI * 2 * currentFrequency) / SAMPLE_RATE;
    const body = Math.sin(phase) + warmth * Math.sin(phase * 2.01) + warmth * 0.35 * Math.sin(phase * 3.02);
    samples[startIndex + index] += body * gain * envelope(time, duration, attack, release);
  }
}

function addNoise(samples, options) {
  const {
    start = 0,
    duration,
    gain,
    attack = 0.005,
    release = 0.7,
    smooth = 0.16,
    movement = 0,
  } = options;
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  let filtered = 0;

  for (let index = 0; index < sampleCount && startIndex + index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = index / Math.max(1, sampleCount - 1);
    const dynamicSmooth = Math.min(0.92, Math.max(0.02, smooth + movement * progress));
    filtered += (randomSigned() - filtered) * dynamicSmooth;
    samples[startIndex + index] += filtered * gain * envelope(time, duration, attack, release);
  }
}

function addStrike(samples, start, gain = 0.5) {
  addNoise(samples, { start, duration: 0.09, gain, attack: 0.001, release: 0.92, smooth: 0.32 });
  addTone(samples, {
    start,
    duration: 0.34,
    frequency: 104,
    endFrequency: 58,
    gain: gain * 0.72,
    attack: 0.001,
    release: 0.9,
    warmth: 0.34,
  });
}

function addEcho(samples, delaySeconds, amount) {
  const delay = Math.floor(delaySeconds * SAMPLE_RATE);
  for (let index = delay; index < samples.length; index += 1) {
    samples[index] += samples[index - delay] * amount;
  }
}

function normalize(samples, ceiling = 0.88) {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
  if (peak <= ceiling || peak === 0) return samples;
  const scale = ceiling / peak;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  return samples;
}

function createSamples(name) {
  const durations = {
    select: 0.24,
    draw: 0.48,
    place: 0.46,
    flip: 0.5,
    capture: 0.92,
    sacrifice: 0.82,
    victory: 2.15,
    defeat: 1.95,
    drawResult: 1.65,
  };
  const samples = new Float32Array(Math.floor((durations[name] || 0.5) * SAMPLE_RATE));

  if (name === 'select') {
    addNoise(samples, { duration: 0.13, gain: 0.23, attack: 0.002, release: 0.9, smooth: 0.1 });
    addTone(samples, { start: 0.035, duration: 0.2, frequency: 290, endFrequency: 240, gain: 0.09, release: 0.85 });
  } else if (name === 'draw') {
    addNoise(samples, { duration: 0.42, gain: 0.34, attack: 0.08, release: 0.72, smooth: 0.06, movement: 0.2 });
    addTone(samples, { start: 0.08, duration: 0.36, frequency: 180, endFrequency: 390, gain: 0.1, attack: 0.08, release: 0.7 });
    addEcho(samples, 0.07, 0.18);
  } else if (name === 'place') {
    addStrike(samples, 0, 0.52);
    addTone(samples, { start: 0.03, duration: 0.42, frequency: 146, endFrequency: 112, gain: 0.2, attack: 0.006, release: 0.82, warmth: 0.3 });
    addEcho(samples, 0.09, 0.2);
  } else if (name === 'flip') {
    addNoise(samples, { duration: 0.38, gain: 0.42, attack: 0.16, release: 0.7, smooth: 0.04, movement: 0.38 });
    addTone(samples, { start: 0.08, duration: 0.34, frequency: 230, endFrequency: 610, gain: 0.12, attack: 0.12, release: 0.76 });
    addNoise(samples, { start: 0.3, duration: 0.12, gain: 0.28, attack: 0.004, release: 0.92, smooth: 0.2 });
    addEcho(samples, 0.055, 0.17);
  } else if (name === 'capture') {
    addStrike(samples, 0, 0.68);
    addTone(samples, { duration: 0.78, frequency: 82, endFrequency: 46, gain: 0.34, attack: 0.003, release: 0.88, warmth: 0.38 });
    addTone(samples, { start: 0.06, duration: 0.72, frequency: 286, endFrequency: 196, gain: 0.16, attack: 0.015, release: 0.8 });
    addTone(samples, { start: 0.14, duration: 0.55, frequency: 716, endFrequency: 524, gain: 0.08, attack: 0.05, release: 0.78 });
    addEcho(samples, 0.11, 0.28);
    addEcho(samples, 0.19, 0.16);
  } else if (name === 'sacrifice') {
    addNoise(samples, { duration: 0.7, gain: 0.26, attack: 0.09, release: 0.82, smooth: 0.08, movement: -0.04 });
    addTone(samples, { duration: 0.78, frequency: 178, endFrequency: 54, gain: 0.29, attack: 0.025, release: 0.84, warmth: 0.3 });
    addEcho(samples, 0.13, 0.25);
  } else if (name === 'victory') {
    addStrike(samples, 0, 0.35);
    [
      [0.05, 196, 0.9, 0.2],
      [0.32, 247, 0.95, 0.2],
      [0.61, 294, 1.05, 0.22],
      [0.94, 392, 1.1, 0.26],
    ].forEach(([start, frequency, duration, gain]) => {
      addTone(samples, { start, duration, frequency, gain, attack: 0.06, release: 0.68, warmth: 0.28 });
      addTone(samples, { start, duration, frequency: frequency / 2, gain: gain * 0.54, attack: 0.04, release: 0.75, warmth: 0.35 });
    });
    addNoise(samples, { start: 0.82, duration: 1.15, gain: 0.1, attack: 0.18, release: 0.8, smooth: 0.025, movement: 0.08 });
    addEcho(samples, 0.16, 0.25);
    addEcho(samples, 0.31, 0.15);
  } else if (name === 'defeat') {
    addStrike(samples, 0, 0.42);
    [
      [0.02, 174, 0.9, 0.22],
      [0.38, 138, 1.0, 0.24],
      [0.78, 92, 1.05, 0.28],
    ].forEach(([start, frequency, duration, gain]) => {
      addTone(samples, { start, duration, frequency, endFrequency: frequency * 0.84, gain, attack: 0.05, release: 0.78, warmth: 0.38 });
    });
    addNoise(samples, { start: 0.3, duration: 1.45, gain: 0.12, attack: 0.16, release: 0.86, smooth: 0.045 });
    addEcho(samples, 0.18, 0.24);
  } else if (name === 'drawResult') {
    addTone(samples, { duration: 1.45, frequency: 146, endFrequency: 146, gain: 0.22, attack: 0.12, release: 0.72, warmth: 0.3 });
    addTone(samples, { start: 0.04, duration: 1.4, frequency: 196, endFrequency: 184, gain: 0.16, attack: 0.14, release: 0.74 });
    addEcho(samples, 0.2, 0.24);
  }

  return normalize(samples);
}

function samplesToWavDataUri(samples) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

function audioAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof window.btoa === 'function' &&
    !window.navigator?.userAgent?.toLowerCase().includes('jsdom')
  );
}

function getSound(name) {
  if (!audioAvailable()) return null;
  if (!sounds.has(name)) {
    sounds.set(
      name,
      new Howl({
        src: [samplesToWavDataUri(createSamples(name))],
        format: ['wav'],
        preload: true,
        volume: MASTER_VOLUME,
      })
    );
  }
  return sounds.get(name);
}

export function playArenaSfx(name, options = {}) {
  if (!audioAvailable()) return null;
  const { delay = 0, volume = 1, rate = 1 } = options;
  const play = () => {
    const sound = getSound(name);
    if (!sound) return;
    const soundId = sound.play();
    sound.volume(Math.max(0, Math.min(1, MASTER_VOLUME * volume)), soundId);
    sound.rate(rate, soundId);
  };

  if (delay <= 0) {
    play();
    return null;
  }

  const timeoutID = window.setTimeout(() => {
    scheduledSounds.delete(timeoutID);
    play();
  }, delay);
  scheduledSounds.add(timeoutID);
  return timeoutID;
}

export function getActionSfxTimeline(action) {
  if (!action) return [];
  if (action.type === 'draw') return [{ name: 'draw', delay: 0, volume: 0.72 }];
  if (action.type === 'sacrifice') return [{ name: 'sacrifice', delay: 0, volume: 0.86 }];
  if (action.type !== 'play') return [];

  const captures = Array.isArray(action.captures) ? action.captures : [];
  const timeline = [{ name: 'place', delay: 0, volume: action.owner === '1' ? 0.86 : 1 }];
  captures.slice(0, 6).forEach((_, index) => {
    timeline.push({ name: 'flip', delay: 115 + index * 92, volume: 0.74 + Math.min(index, 2) * 0.06 });
  });
  if (captures.length > 0) {
    timeline.push({
      name: 'capture',
      delay: 205 + Math.min(captures.length - 1, 5) * 92,
      volume: Math.min(1.12, 0.88 + captures.length * 0.06),
      rate: captures.length > 1 ? 0.94 : 1,
    });
  }
  return timeline;
}

export function playActionSfx(action) {
  getActionSfxTimeline(action).forEach(({ name, ...options }) => playArenaSfx(name, options));
}

export function playResultSfx(resultTitle) {
  const name = resultTitle === 'Victory' ? 'victory' : resultTitle === 'Defeat' ? 'defeat' : 'drawResult';
  return playArenaSfx(name, { delay: 380, volume: 0.92 });
}

export function stopArenaAudio() {
  scheduledSounds.forEach((timeoutID) => window.clearTimeout(timeoutID));
  scheduledSounds.clear();
  sounds.forEach((sound) => sound.stop());
}

export function setArenaMuted(muted) {
  Howler.mute(Boolean(muted));
}
