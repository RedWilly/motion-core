import { describe, expect, test } from 'bun:test';
import {
  createMediabunnyMetadataReader,
  mapCompositionTimeToMediaTime,
  normalizeAudioLayerConfig,
  normalizeVideoLayerConfig,
  readMediaMetadata,
  type MediabunnyRuntime,
} from './media-metadata';

describe('media metadata', () => {
  test('reads container and track metadata without decoded sample sinks', async () => {
    const calls: string[] = [];
    let disposed = false;

    const runtime: MediabunnyRuntime = {
      ALL_FORMATS: Symbol('formats'),
      BlobSource: class {
        constructor(_source: Blob) {
          calls.push('BlobSource');
        }
      },
      Input: class {
        constructor(_options: { source: unknown; formats: unknown }) {
          calls.push('Input');
        }

        async getDurationFromMetadata(): Promise<number | null> {
          return 12;
        }

        async computeDuration(): Promise<number> {
          calls.push('computeDuration');
          return 13;
        }

        async getMimeType(): Promise<string> {
          return 'video/mp4';
        }

        async getPrimaryVideoTrack() {
          return {
            getCodec: async () => 'avc',
            getDisplayWidth: async () => 1920,
            getDisplayHeight: async () => 1080,
            getRotation: async () => 0,
            getDurationFromMetadata: async () => 12,
            computePacketStats: async (targetPacketCount?: number) => {
              calls.push(`videoStats:${targetPacketCount}`);
              return { packetCount: 60, averagePacketRate: 30, averageBitrate: 4_000_000 };
            },
          };
        }

        async getPrimaryAudioTrack() {
          return {
            getCodec: async () => 'aac',
            getSampleRate: async () => 48_000,
            getNumberOfChannels: async () => 2,
            getDurationFromMetadata: async () => 12,
            computePacketStats: async (targetPacketCount?: number) => {
              calls.push(`audioStats:${targetPacketCount}`);
              return { packetCount: 60, averagePacketRate: 46.875, averageBitrate: 192_000 };
            },
          };
        }

        dispose(): void {
          disposed = true;
        }
      },
    };

    const reader = createMediabunnyMetadataReader(async () => runtime);
    const metadata = await readMediaMetadata(new Blob(['media']), reader);

    expect(metadata).toEqual({
      duration: 12,
      mimeType: 'video/mp4',
      video: {
        codec: 'avc',
        width: 1920,
        height: 1080,
        rotation: 0,
        duration: 12,
        frameRate: 30,
        bitrate: 4_000_000,
      },
      audio: {
        codec: 'aac',
        sampleRate: 48_000,
        channels: 2,
        duration: 12,
        bitrate: 192_000,
      },
    });
    expect(calls).toContain('videoStats:60');
    expect(calls).toContain('audioStats:60');
    expect(calls).not.toContain('computeDuration');
    expect(disposed).toBe(true);
  });

  test('computes container duration only when metadata duration is missing', async () => {
    const runtime: MediabunnyRuntime = {
      ALL_FORMATS: null,
      BlobSource: class {},
      Input: class {
        async getDurationFromMetadata(): Promise<number | null> {
          return null;
        }

        async computeDuration(): Promise<number> {
          return 8;
        }

        async getMimeType(): Promise<string> {
          return 'audio/wav';
        }

        async getPrimaryVideoTrack(): Promise<null> {
          return null;
        }

        async getPrimaryAudioTrack(): Promise<null> {
          return null;
        }

        dispose(): void {}
      },
    };

    const metadata = await readMediaMetadata(
      new Blob(['audio']),
      createMediabunnyMetadataReader(async () => runtime),
    );

    expect(metadata).toEqual({ duration: 8, mimeType: 'audio/wav' });
  });

  test('normalizes media timing and maps composition time to source time', () => {
    const video = normalizeVideoLayerConfig({ inPoint: 2, outPoint: 5, playbackRate: 1.5 });

    expect(mapCompositionTimeToMediaTime(1, video)).toBe(3.5);
    expect(mapCompositionTimeToMediaTime(4, video)).toBe(5);
  });

  test('normalizes audio-specific controls', () => {
    expect(normalizeAudioLayerConfig({ volume: 0.5, fadeIn: 0.25, fadeOut: 0.5 })).toEqual({
      inPoint: 0,
      outPoint: null,
      playbackRate: 1,
      volume: 0.5,
      fadeIn: 0.25,
      fadeOut: 0.5,
    });
  });

  test('rejects invalid media ranges and audio values', () => {
    expect(() => normalizeVideoLayerConfig({ inPoint: 4, outPoint: 4 })).toThrow();
    expect(() => normalizeVideoLayerConfig({ playbackRate: 0 })).toThrow();
    expect(() => normalizeAudioLayerConfig({ volume: 2 })).toThrow();
    expect(() => normalizeAudioLayerConfig({ fadeIn: -1 })).toThrow();
  });
});
