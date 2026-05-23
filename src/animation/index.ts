export interface KeyframeConfig {
  easing?: string | ((progress: number) => number);
  hold?: boolean;
}

export interface AnimationConfig {
  duration: number;
  delay?: number;
  easing?: string;
  repeat?: number;
  yoyo?: boolean;
  onComplete?: () => void;
}

export interface Keyframe {
  id: string;
  property: string;
  time: number;
  value: unknown;
  easing: string | ((progress: number) => number);
  hold: boolean;
}

export function createKeyframe(
  id: string,
  property: string,
  time: number,
  value: unknown,
  config: KeyframeConfig = {},
): Keyframe {
  return {
    id,
    property,
    time,
    value,
    easing: config.easing ?? 'power1.out',
    hold: config.hold ?? false,
  };
}
