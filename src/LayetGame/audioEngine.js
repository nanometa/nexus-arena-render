import { Howl, Howler } from 'howler';

const MASTER_VOLUME = 0.136;
const sounds = new Map();
const scheduledSounds = new Set();
const audioRoot = `${process.env.PUBLIC_URL || ''}/assets/audio/nexus`;

const soundFiles = {
  select: 'select.wav',
  draw: 'draw.wav',
  place: 'place.wav',
  flip: 'flip.wav',
  capture: 'capture.wav',
  sacrifice: 'sacrifice.wav',
  victory: 'victory.wav',
  defeat: 'defeat.wav',
  drawResult: 'draw-result.wav',
};

function audioAvailable() {
  return (
    typeof window !== 'undefined' &&
    !window.navigator?.userAgent?.toLowerCase().includes('jsdom')
  );
}

function getSound(name) {
  if (!audioAvailable() || !soundFiles[name]) return null;
  if (!sounds.has(name)) {
    sounds.set(
      name,
      new Howl({
        src: [`${audioRoot}/${soundFiles[name]}`],
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
  if (action.type === 'draw') return [{ name: 'draw', delay: 0, volume: 0.66 }];
  if (action.type === 'sacrifice') return [{ name: 'sacrifice', delay: 0, volume: 0.82 }];
  if (action.type !== 'play') return [];

  const captures = Array.isArray(action.captures) ? action.captures : [];
  const timeline = [{ name: 'place', delay: 0, volume: action.owner === '1' ? 0.78 : 0.9 }];
  captures.slice(0, 6).forEach((_, index) => {
    timeline.push({ name: 'flip', delay: 140 + index * 108, volume: 0.66 + Math.min(index, 2) * 0.05 });
  });
  if (captures.length > 0) {
    timeline.push({
      name: 'capture',
      delay: 285 + Math.min(captures.length - 1, 5) * 108,
      volume: Math.min(1, 0.8 + captures.length * 0.05),
      rate: captures.length > 1 ? 0.96 : 1,
    });
  }
  return timeline;
}

export function playActionSfx(action) {
  getActionSfxTimeline(action).forEach(({ name, ...options }) => playArenaSfx(name, options));
}

export function playResultSfx(resultTitle) {
  const name = resultTitle === 'Victory' ? 'victory' : resultTitle === 'Defeat' ? 'defeat' : 'drawResult';
  return playArenaSfx(name, { delay: 380, volume: 0.88 });
}

export function stopArenaAudio() {
  scheduledSounds.forEach((timeoutID) => window.clearTimeout(timeoutID));
  scheduledSounds.clear();
  sounds.forEach((sound) => sound.stop());
}

export function setArenaMuted(muted) {
  Howler.mute(Boolean(muted));
}
