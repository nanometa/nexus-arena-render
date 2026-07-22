import { getActionSfxTimeline } from '../audioEngine';

describe('arena sound timeline', () => {
  test('plays a grounded placement sound for a normal card', () => {
    expect(getActionSfxTimeline({ type: 'play', owner: '0', captures: [] })).toEqual([
      { name: 'place', delay: 0, volume: 1 },
    ]);
  });

  test('stages a flip for every captured card before the capture impact', () => {
    const timeline = getActionSfxTimeline({ type: 'play', owner: '1', captures: [{}, {}, {}] });

    expect(timeline.map((event) => event.name)).toEqual([
      'place',
      'flip',
      'flip',
      'flip',
      'capture',
    ]);
    expect(timeline[1].delay).toBe(115);
    expect(timeline[3].delay).toBe(299);
    expect(timeline[4].delay).toBeGreaterThan(timeline[3].delay);
  });

  test('maps draw and sacrifice actions without arcade cues', () => {
    expect(getActionSfxTimeline({ type: 'draw' })[0].name).toBe('draw');
    expect(getActionSfxTimeline({ type: 'sacrifice' })[0].name).toBe('sacrifice');
  });
});
