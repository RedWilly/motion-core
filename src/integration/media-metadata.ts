import type {
  AudioLayerConfig,
  MediaLayerConfig,
  VideoLayerConfig,
} from '../shared/project';
import { EngineError, validationError } from '../shared/errors';
import { assertNonNegativeNumber, assertPositiveNumber, assertUnitRange } from '../shared/validation';

export interface VideoMetadata {
  codec: string | null;
  width: number;
  height: number;
  rotation: number;
  duration: number | null;
  frameRate: number | null;
  bitrate: number | null;
}

export interface AudioMetadata {
  codec: string | null;
  sampleRate: number;
  channels: number;
  duration: number | null;
  bitrate: number | null;
}

export interface MediaMetadata {
  duration: number | null;
  mimeType: string;
  video?: VideoMetadata;
  audio?: AudioMetadata;
}

export interface NormalizedMediaLayerConfig {
  inPoint: number;
  outPoint: number | null;
  playbackRate: number;
}

export interface NormalizedVideoLayerConfig extends NormalizedMediaLayerConfig {}

export interface NormalizedAudioLayerConfig extends NormalizedMediaLayerConfig {
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

interface PacketStatsLike {
  averagePacketRate: number;
  averageBitrate: number;
}

interface VideoTrackLike {
  getCodec(): Promise<string | null>;
  getDisplayWidth(): Promise<number>;
  getDisplayHeight(): Promise<number>;
  getRotation(): Promise<number>;
  getDurationFromMetadata(): Promise<number | null>;
  computePacketStats(targetPacketCount?: number): Promise<PacketStatsLike>;
}

interface AudioTrackLike {
  getCodec(): Promise<string | null>;
  getSampleRate(): Promise<number>;
  getNumberOfChannels(): Promise<number>;
  getDurationFromMetadata(): Promise<number | null>;
  computePacketStats(targetPacketCount?: number): Promise<PacketStatsLike>;
}

interface InputLike {
  getDurationFromMetadata(): Promise<number | null>;
  computeDuration(): Promise<number>;
  getMimeType(): Promise<string>;
  getPrimaryVideoTrack(): Promise<VideoTrackLike | null>;
  getPrimaryAudioTrack(): Promise<AudioTrackLike | null>;
  dispose(): void;
}

export interface MediabunnyRuntime {
  ALL_FORMATS: unknown;
  BlobSource: new (source: Blob) => unknown;
  Input: new (options: { source: unknown; formats: unknown }) => InputLike;
}

export interface MediaMetadataReader {
  read(source: Blob): Promise<MediaMetadata>;
}

const TRACK_PACKET_SAMPLE_COUNT = 60;

export async function readMediaMetadata(
  source: Blob,
  reader: MediaMetadataReader = createMediabunnyMetadataReader(),
): Promise<MediaMetadata> {
  return reader.read(source);
}

export function createMediabunnyMetadataReader(
  runtimeLoader: () => Promise<MediabunnyRuntime> = loadMediabunnyRuntime,
): MediaMetadataReader {
  return {
    async read(source: Blob): Promise<MediaMetadata> {
      const runtime = await runtimeLoader();
      const input = new runtime.Input({
        source: new runtime.BlobSource(source),
        formats: runtime.ALL_FORMATS,
      });

      try {
        const [durationFromMetadata, mimeType, videoTrack, audioTrack] = await Promise.all([
          input.getDurationFromMetadata(),
          input.getMimeType(),
          input.getPrimaryVideoTrack(),
          input.getPrimaryAudioTrack(),
        ]);
        const duration = durationFromMetadata ?? (await input.computeDuration());
        const metadata: MediaMetadata = { duration, mimeType };

        if (videoTrack !== null) metadata.video = await readVideoTrackMetadata(videoTrack);
        if (audioTrack !== null) metadata.audio = await readAudioTrackMetadata(audioTrack);

        return metadata;
      } catch (error) {
        throw new EngineError({
          code: 'MEDIA_METADATA_READ_FAILED',
          message: 'Unable to read media metadata.',
          category: 'resource',
          originalError: error,
        });
      } finally {
        input.dispose();
      }
    },
  };
}

export function normalizeVideoLayerConfig(config: VideoLayerConfig = {}): NormalizedVideoLayerConfig {
  return normalizeMediaLayerConfig(config);
}

export function normalizeAudioLayerConfig(config: AudioLayerConfig = {}): NormalizedAudioLayerConfig {
  const base = normalizeMediaLayerConfig(config);
  const volume = config.volume ?? 1;
  const fadeIn = config.fadeIn ?? 0;
  const fadeOut = config.fadeOut ?? 0;

  assertUnitRange(volume, 'volume');
  assertNonNegativeNumber(fadeIn, 'fadeIn');
  assertNonNegativeNumber(fadeOut, 'fadeOut');

  return { ...base, volume, fadeIn, fadeOut };
}

export function mapCompositionTimeToMediaTime(
  compositionTime: number,
  config: NormalizedMediaLayerConfig,
): number {
  assertNonNegativeNumber(compositionTime, 'compositionTime');
  const mediaTime = config.inPoint + compositionTime * config.playbackRate;
  if (config.outPoint === null) return mediaTime;
  return Math.min(mediaTime, config.outPoint);
}

function normalizeMediaLayerConfig(config: MediaLayerConfig): NormalizedMediaLayerConfig {
  const inPoint = config.inPoint ?? 0;
  const outPoint = config.outPoint ?? null;
  const playbackRate = config.playbackRate ?? 1;

  assertNonNegativeNumber(inPoint, 'inPoint');
  if (outPoint !== null) assertNonNegativeNumber(outPoint, 'outPoint');
  assertPositiveNumber(playbackRate, 'playbackRate');

  if (outPoint !== null && outPoint <= inPoint) {
    throw validationError(
      'INVALID_MEDIA_RANGE',
      'outPoint must be greater than inPoint.',
      { propertyName: 'outPoint', value: outPoint },
    );
  }

  return { inPoint, outPoint, playbackRate };
}

async function readVideoTrackMetadata(track: VideoTrackLike): Promise<VideoMetadata> {
  const [codec, width, height, rotation, duration, packetStats] = await Promise.all([
    track.getCodec(),
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.getRotation(),
    track.getDurationFromMetadata(),
    track.computePacketStats(TRACK_PACKET_SAMPLE_COUNT),
  ]);

  return {
    codec,
    width,
    height,
    rotation,
    duration,
    frameRate: finiteOrNull(packetStats.averagePacketRate),
    bitrate: finiteOrNull(packetStats.averageBitrate),
  };
}

async function readAudioTrackMetadata(track: AudioTrackLike): Promise<AudioMetadata> {
  const [codec, sampleRate, channels, duration, packetStats] = await Promise.all([
    track.getCodec(),
    track.getSampleRate(),
    track.getNumberOfChannels(),
    track.getDurationFromMetadata(),
    track.computePacketStats(TRACK_PACKET_SAMPLE_COUNT),
  ]);

  return {
    codec,
    sampleRate,
    channels,
    duration,
    bitrate: finiteOrNull(packetStats.averageBitrate),
  };
}

async function loadMediabunnyRuntime(): Promise<MediabunnyRuntime> {
  return import('mediabunny') as Promise<MediabunnyRuntime>;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
