import { EngineError } from '../shared/errors';

export interface MediaMetadata {
  duration: number | null;
  mimeType: string;
  video?: {
    codec: string | null;
    width: number;
    height: number;
    rotation: number;
  };
  audio?: {
    codec: string | null;
    sampleRate: number;
    channels: number;
  };
}

export async function readMediaMetadata(source: Blob): Promise<MediaMetadata> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({
      source: new BlobSource(source),
      formats: ALL_FORMATS,
    });

    try {
      const [duration, mimeType, videoTrack, audioTrack] = await Promise.all([
        input.getDurationFromMetadata().then((value) => value ?? input.computeDuration()),
        input.getMimeType(),
        input.getPrimaryVideoTrack(),
        input.getPrimaryAudioTrack(),
      ]);

      const [video, audio] = await Promise.all([
        videoTrack
          ? Promise.all([
              videoTrack.getCodec(),
              videoTrack.getDisplayWidth(),
              videoTrack.getDisplayHeight(),
              videoTrack.getRotation(),
            ]).then(([codec, width, height, rotation]) => ({ codec, width, height, rotation }))
          : undefined,
        audioTrack
          ? Promise.all([
              audioTrack.getCodec(),
              audioTrack.getSampleRate(),
              audioTrack.getNumberOfChannels(),
            ]).then(([codec, sampleRate, channels]) => ({ codec, sampleRate, channels }))
          : undefined,
      ]);

      return { duration, mimeType, video, audio };
    } finally {
      input.dispose();
    }
  } catch (error) {
    throw new EngineError({
      code: 'MEDIA_METADATA_FAILED',
      message: 'Unable to read media metadata.',
      category: 'resource',
      originalError: error,
    });
  }
}
