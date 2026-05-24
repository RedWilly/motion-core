import { describe, expect, test } from 'bun:test';
import { EngineError } from './errors';
import {
  blur,
  brightness,
  channels,
  effectPresets,
  grayscale,
  invert,
  pixelate,
  saturation,
  threshold,
  tint,
} from './effect-presets';

describe('effect presets', () => {
  test('builds modern Scrawl action configs for common effects', () => {
    expect(blur({ id: 'soft', radius: 3, opacity: 0.5, lineOut: 'blurred' })).toEqual({
      id: 'soft',
      actions: [{ action: 'gaussian-blur', radiusHorizontal: 3, radiusVertical: 3, lineOut: 'blurred' }],
      opacity: 0.5,
    });
    expect(pixelate({ tileWidth: 12, offsetX: 2 })).toEqual({
      actions: [{ action: 'pixelate', tileWidth: 12, tileHeight: 12, offsetX: 2 }],
    });
    expect(threshold({ level: 6, high: [0, 0, 0, 255], low: [0, 0, 0, 0] })).toEqual({
      actions: [{ action: 'threshold', level: 6, high: [0, 0, 0, 255], low: [0, 0, 0, 0] }],
    });
    expect(tint({ redInRed: 0.8, blueInGreen: 0.25 })).toEqual({
      actions: [
        {
          action: 'tint-channels',
          redInRed: 0.8,
          redInGreen: 0,
          redInBlue: 0,
          greenInRed: 0,
          greenInGreen: 1,
          greenInBlue: 0,
          blueInRed: 0,
          blueInGreen: 0.25,
          blueInBlue: 1,
        },
      ],
    });
  });

  test('builds channel modulation presets without legacy filter methods', () => {
    expect(brightness({ level: 1.2 })).toEqual({
      actions: [{ action: 'modulate-channels', red: 1.2, green: 1.2, blue: 1.2, alpha: 1 }],
    });
    expect(saturation({ id: 'sat', level: 0.75 })).toEqual({
      id: 'sat',
      actions: [{ action: 'modulate-channels', red: 0.75, green: 0.75, blue: 0.75, alpha: 1, saturation: true }],
    });
    expect(channels({ red: 1, green: 0.5, blue: 0.25, alpha: 1 })).toEqual({
      actions: [{ action: 'modulate-channels', red: 1, green: 0.5, blue: 0.25, alpha: 1 }],
    });
    expect(grayscale()).toEqual({ actions: [{ action: 'grayscale' }] });
    expect(invert()).toEqual({ actions: [{ action: 'invert-channels' }] });
    expect(effectPresets.blur).toBe(blur);
  });

  test('clones color arrays and rejects invalid preset values', () => {
    const high = [255, 255, 255, 255] as const;
    const config = threshold({ high });

    expect(config.actions[0]?.high).toEqual([255, 255, 255, 255]);
    expect(config.actions[0]?.high).not.toBe(high);

    expect(() => blur({ radius: -1 })).toThrow(EngineError);
    expect(() => pixelate({ tileWidth: 0 })).toThrow('tileWidth must be a positive number.');
    expect(() => threshold({ level: 256 })).toThrow('level must be an integer between 0 and 255.');
    expect(() => tint({ redInRed: 2 })).toThrow('redInRed must be between 0 and 1.');
    expect(() => channels({ red: -0.1 })).toThrow('red must be a non-negative number.');
  });
});
