import type { Layer } from './project';
import type { MotionStateTarget } from './runtime';

export type LayerMotionProperty =
  | 'position.x'
  | 'position.y'
  | 'rotation'
  | 'scale.x'
  | 'scale.y'
  | 'anchor.x'
  | 'anchor.y'
  | 'opacity';

export interface NumericPropertyBinding {
  readonly target: Record<string, number>;
  readonly key: string;
}

export function bindLayerMotionProperty(layer: Layer, property: LayerMotionProperty): NumericPropertyBinding {
  switch (property) {
    case 'position.x':
      return { target: layer.transform.position as unknown as Record<string, number>, key: 'x' };
    case 'position.y':
      return { target: layer.transform.position as unknown as Record<string, number>, key: 'y' };
    case 'rotation':
      return { target: layer.transform as unknown as Record<string, number>, key: 'rotation' };
    case 'scale.x':
      return { target: layer.transform.scale as unknown as Record<string, number>, key: 'x' };
    case 'scale.y':
      return { target: layer.transform.scale as unknown as Record<string, number>, key: 'y' };
    case 'anchor.x':
      return { target: layer.transform.anchor as unknown as Record<string, number>, key: 'x' };
    case 'anchor.y':
      return { target: layer.transform.anchor as unknown as Record<string, number>, key: 'y' };
    case 'opacity':
      return { target: layer as unknown as Record<string, number>, key: 'opacity' };
  }
}

export function bindMotionTargetProperty<TValues extends Record<string, number>>(
  target: MotionStateTarget<TValues>,
  key: keyof TValues & string,
): NumericPropertyBinding {
  return { target: target.values, key };
}

export function readNumericBinding(binding: NumericPropertyBinding): number {
  return binding.target[binding.key]!;
}

export function writeNumericBinding(binding: NumericPropertyBinding, value: number): void {
  binding.target[binding.key] = value;
}
