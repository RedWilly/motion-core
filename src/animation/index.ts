import { EngineError, validationError } from '../shared/errors';
import type { Composition, Layer, TimelineTweenAdapter } from '../shared/types';
import { createId } from '../shared/ids';
import { syncLayerToScrawl } from '../integration/synchronization';

export type AnimatableProperty =
  | 'position.x'
  | 'position.y'
  | 'rotation'
  | 'scale.x'
  | 'scale.y'
  | 'anchor.x'
  | 'anchor.y'
  | 'opacity';

export type Easing = string | ((progress: number) => number);

export type AnimationValues = Partial<Record<AnimatableProperty, number>>;

export interface KeyframeConfig {
  easing?: Easing;
  hold?: boolean;
}

export interface AnimationConfig {
  duration: number;
  delay?: number;
  easing?: Easing;
  repeat?: number;
  yoyo?: boolean;
  onComplete?: () => void;
}

export interface Keyframe {
  id: string;
  property: AnimatableProperty;
  time: number;
  value: number;
  easing: Easing;
  hold: boolean;
  tween: TimelineTweenAdapter;
}

export interface Animation {
  id: string;
  tweens: readonly TimelineTweenAdapter[];
  kill(): void;
}

export interface ExpressionAudioContext {
  amplitude: number;
  bands: {
    bass: number;
    mid: number;
    treble: number;
  };
}

export interface ExpressionContext {
  time: number;
  frame: number;
  layer: Layer;
  property: AnimatableProperty;
  value: number;
  audio?: ExpressionAudioContext;
}

export interface ExpressionHelpers {
  clamp(value: number, min: number, max: number): number;
  lerp(start: number, end: number, amount: number): number;
  random(min?: number, max?: number, seed?: number): number;
  wiggle(frequency: number, amplitude: number, seed?: number): number;
}

export interface Expression {
  id: string;
  layer: Layer;
  property: AnimatableProperty;
  source: string;
}

export interface ExpressionApplyResult {
  applied: number;
  errors: readonly EngineError[];
}

interface PropertyBinding {
  target: object;
  key: string;
}

interface CompiledExpression extends Expression {
  evaluate: (context: ExpressionContext, helpers: ExpressionHelpers) => unknown;
  lastValidValue: number;
}

const defaultEase = 'power1.out';

export class AnimationController {
  private readonly composition: Composition;
  private readonly keyframes = new Map<Layer, Map<AnimatableProperty, Keyframe[]>>();
  private readonly expressions = new Map<Layer, Map<AnimatableProperty, CompiledExpression>>();
  private readonly expressionErrors: EngineError[] = [];

  constructor(composition: Composition) {
    this.composition = composition;
  }

  addKeyframe(
    layer: Layer,
    property: AnimatableProperty,
    time: number,
    value: number,
    config: KeyframeConfig = {},
  ): Keyframe {
    this.assertLayerCanAnimate(layer);
    this.assertTimeInRange(time);

    const binding = bindProperty(layer, property);
    const propertyKeyframes = this.getPropertyKeyframes(layer, property);
    const previous = findPreviousKeyframe(propertyKeyframes, time);
    const startTime = previous?.time ?? 0;
    const duration = config.hold === true ? 0 : Math.max(time - startTime, 0);
    const tween = this.createTween(layer, binding, value, {
      duration,
      ease: config.easing ?? defaultEase,
      hold: config.hold ?? false,
      position: config.hold === true ? time : startTime,
    });
    const keyframe: Keyframe = {
      id: createId('keyframe'),
      property,
      time,
      value,
      easing: config.easing ?? defaultEase,
      hold: config.hold ?? false,
      tween,
    };

    insertSorted(propertyKeyframes, keyframe);
    return keyframe;
  }

  removeKeyframe(layer: Layer, keyframe: Keyframe): void {
    const propertyKeyframes = this.keyframes.get(layer)?.get(keyframe.property);
    if (!propertyKeyframes) return;

    const index = propertyKeyframes.indexOf(keyframe);
    if (index >= 0) propertyKeyframes.splice(index, 1);
    this.composition.timeline.remove?.(keyframe.tween);
    keyframe.tween.kill();
  }

  animate(layer: Layer, values: AnimationValues, config: AnimationConfig): Animation {
    this.assertLayerCanAnimate(layer);
    assertPositiveDuration(config.duration);

    const tweens: TimelineTweenAdapter[] = [];
    const position = this.composition.timeline.time() + (config.delay ?? 0);

    for (const property of Object.keys(values) as AnimatableProperty[]) {
      const value = values[property];
      if (value === undefined) continue;

      const binding = bindProperty(layer, property);
      const options: {
        duration: number;
        ease: Easing;
        repeat?: number;
        yoyo?: boolean;
        onComplete?: () => void;
        position: number;
      } = {
        duration: config.duration,
        ease: config.easing ?? defaultEase,
        position,
      };

      if (config.repeat !== undefined) options.repeat = config.repeat;
      if (config.yoyo !== undefined) options.yoyo = config.yoyo;
      if (config.onComplete !== undefined) options.onComplete = config.onComplete;

      tweens.push(this.createTween(layer, binding, value, options));
    }

    return createAnimation(createId('animation'), tweens);
  }

  removeAnimationsForLayer(layer: Layer): void {
    for (const propertyKeyframes of this.keyframes.get(layer)?.values() ?? []) {
      for (const keyframe of propertyKeyframes) keyframe.tween.kill();
    }
    this.keyframes.delete(layer);
    this.composition.timeline.killTweensOf?.(layer.transform.position);
    this.composition.timeline.killTweensOf?.(layer.transform.scale);
    this.composition.timeline.killTweensOf?.(layer.transform.anchor);
    this.composition.timeline.killTweensOf?.(layer);
  }

  setExpression(layer: Layer, property: AnimatableProperty, source: string): Expression {
    this.assertLayerCanAnimate(layer);
    const binding = bindProperty(layer, property);
    const compiled: CompiledExpression = {
      id: createId('expression'),
      layer,
      property,
      source,
      evaluate: compileExpression(source),
      lastValidValue: readBindingValue(binding),
    };
    let layerExpressions = this.expressions.get(layer);
    if (!layerExpressions) {
      layerExpressions = new Map<AnimatableProperty, CompiledExpression>();
      this.expressions.set(layer, layerExpressions);
    }
    layerExpressions.set(property, compiled);

    return expressionView(compiled);
  }

  removeExpression(layer: Layer, property: AnimatableProperty): void {
    const layerExpressions = this.expressions.get(layer);
    if (!layerExpressions) return;

    layerExpressions.delete(property);
    if (layerExpressions.size === 0) this.expressions.delete(layer);
  }

  applyExpressions(time = this.composition.timeline.time(), audio?: ExpressionAudioContext): ExpressionApplyResult {
    if (!Number.isFinite(time) || time < 0 || time > this.composition.duration) {
      throw validationError('EXPRESSION_TIME_OUT_OF_RANGE', 'Expression time is outside composition duration.', {
        propertyName: 'time',
        value: time,
      });
    }

    this.expressionErrors.length = 0;
    let applied = 0;
    const touchedLayers = new Set<Layer>();

    for (const [layer, layerExpressions] of this.expressions) {
      if (layer.locked) continue;

      for (const expression of layerExpressions.values()) {
        const binding = bindProperty(layer, expression.property);
        const context = createExpressionContext(this.composition, layer, expression.property, binding, time, audio);
        try {
          const value = expression.evaluate(context, createExpressionHelpers(time, expression.id));
          const numericValue = numberExpressionResult(value, expression.property);
          writeBindingValue(binding, numericValue);
          expression.lastValidValue = numericValue;
          applied += 1;
        } catch (error) {
          writeBindingValue(binding, expression.lastValidValue);
          this.expressionErrors.push(createExpressionError(expression, error));
        }

        touchedLayers.add(layer);
      }
    }

    for (const layer of touchedLayers) syncLayerToScrawl(layer);

    return { applied, errors: [...this.expressionErrors] };
  }

  getExpressionErrors(): readonly EngineError[] {
    return this.expressionErrors;
  }

  private getPropertyKeyframes(layer: Layer, property: AnimatableProperty): Keyframe[] {
    let layerKeyframes = this.keyframes.get(layer);
    if (!layerKeyframes) {
      layerKeyframes = new Map<AnimatableProperty, Keyframe[]>();
      this.keyframes.set(layer, layerKeyframes);
    }

    let propertyKeyframes = layerKeyframes.get(property);
    if (!propertyKeyframes) {
      propertyKeyframes = [];
      layerKeyframes.set(property, propertyKeyframes);
    }

    return propertyKeyframes;
  }

  private createTween(
    layer: Layer,
    binding: PropertyBinding,
    value: number,
    options: {
      duration: number;
      ease: Easing;
      hold?: boolean;
      repeat?: number;
      yoyo?: boolean;
      onComplete?: () => void;
      position: number;
    },
  ): TimelineTweenAdapter {
    const vars: Record<string, unknown> = {
      [binding.key]: value,
      duration: options.duration,
      ease: options.ease,
      overwrite: false,
      immediateRender: options.hold === true,
      onUpdate: () => syncLayerToScrawl(layer),
    };

    if (options.repeat !== undefined) vars['repeat'] = options.repeat;
    if (options.yoyo !== undefined) vars['yoyo'] = options.yoyo;
    if (options.onComplete !== undefined) vars['onComplete'] = options.onComplete;

    const tween =
      options.hold === true
        ? this.composition.timeline.set?.(binding.target, vars, options.position)
        : this.composition.timeline.to?.(binding.target, vars, options.position);

    if (!tween) {
      throw validationError(
        'TIMELINE_ANIMATION_UNSUPPORTED',
        'Composition timeline does not support GSAP-style tween creation.',
      );
    }

    return tween;
  }

  private assertLayerCanAnimate(layer: Layer): void {
    if (layer.locked) {
      throw validationError('LAYER_LOCKED', 'Cannot animate a locked layer.', {
        layerName: layer.name,
      });
    }
  }

  private assertTimeInRange(time: number): void {
    if (!Number.isFinite(time) || time < 0 || time > this.composition.duration) {
      throw validationError('KEYFRAME_TIME_OUT_OF_RANGE', 'Keyframe time is outside composition duration.', {
        propertyName: 'time',
        value: time,
      });
    }
  }
}

export function createAnimationController(composition: Composition): AnimationController {
  return new AnimationController(composition);
}

function bindProperty(layer: Layer, property: AnimatableProperty): PropertyBinding {
  switch (property) {
    case 'position.x':
      return { target: layer.transform.position, key: 'x' };
    case 'position.y':
      return { target: layer.transform.position, key: 'y' };
    case 'rotation':
      return { target: layer.transform, key: 'rotation' };
    case 'scale.x':
      return { target: layer.transform.scale, key: 'x' };
    case 'scale.y':
      return { target: layer.transform.scale, key: 'y' };
    case 'anchor.x':
      return { target: layer.transform.anchor, key: 'x' };
    case 'anchor.y':
      return { target: layer.transform.anchor, key: 'y' };
    case 'opacity':
      return { target: layer, key: 'opacity' };
  }
}

function compileExpression(source: string): CompiledExpression['evaluate'] {
  if (source.trim().length === 0) {
    throw validationError('EMPTY_EXPRESSION', 'Expression source must not be empty.');
  }

  try {
    return new Function(
      'context',
      'helpers',
      `
const { time, frame, layer, property, value, audio } = context;
const { clamp, lerp, random, wiggle } = helpers;
return (${source});
`,
    ) as CompiledExpression['evaluate'];
  } catch (error) {
    throw new EngineError({
      code: 'EXPRESSION_COMPILE_FAILED',
      message: `Unable to compile expression: ${source}`,
      category: 'validation',
      originalError: error,
    });
  }
}

function createExpressionContext(
  composition: Composition,
  layer: Layer,
  property: AnimatableProperty,
  binding: PropertyBinding,
  time: number,
  audio: ExpressionAudioContext | undefined,
): ExpressionContext {
  const context: ExpressionContext = {
    time,
    frame: Math.round(time * composition.frameRate),
    layer,
    property,
    value: readBindingValue(binding),
  };
  if (audio !== undefined) context.audio = audio;
  return context;
}

function createExpressionHelpers(time: number, expressionId: string): ExpressionHelpers {
  return {
    clamp(value: number, min: number, max: number): number {
      return Math.min(Math.max(value, min), max);
    },
    lerp(start: number, end: number, amount: number): number {
      return start + (end - start) * amount;
    },
    random(min = 0, max = 1, seed = 0): number {
      const value = seededNoise(hashString(expressionId) + seed + time * 997.3);
      return min + (max - min) * value;
    },
    wiggle(frequency: number, amplitude: number, seed = 0): number {
      return (seededNoise(hashString(expressionId) + seed + time * frequency) * 2 - 1) * amplitude;
    },
  };
}

function readBindingValue(binding: PropertyBinding): number {
  const value = (binding.target as Record<string, unknown>)[binding.key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError('EXPRESSION_PROPERTY_NOT_NUMERIC', 'Expression property value must be numeric.', {
      propertyName: binding.key,
      value,
    });
  }
  return value;
}

function writeBindingValue(binding: PropertyBinding, value: number): void {
  (binding.target as Record<string, number>)[binding.key] = value;
}

function numberExpressionResult(value: unknown, property: AnimatableProperty): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError('EXPRESSION_RESULT_NOT_NUMERIC', 'Expression result must be a finite number.', {
      propertyName: property,
      value,
    });
  }
  return value;
}

function createExpressionError(expression: CompiledExpression, error: unknown): EngineError {
  return new EngineError({
    code: 'EXPRESSION_EVALUATION_FAILED',
    message: `Expression failed for ${expression.layer.name}.${expression.property}: ${expression.source}`,
    category: 'runtime',
    context: {
      layerName: expression.layer.name,
      propertyName: expression.property,
      value: expression.source,
    },
    originalError: error,
  });
}

function expressionView(expression: CompiledExpression): Expression {
  return {
    id: expression.id,
    layer: expression.layer,
    property: expression.property,
    source: expression.source,
  };
}

function seededNoise(value: number): number {
  const x = Math.sin(value) * 10000;
  return x - Math.floor(x);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function createAnimation(id: string, tweens: TimelineTweenAdapter[]): Animation {
  return {
    id,
    tweens,
    kill() {
      for (const tween of tweens) tween.kill();
    },
  };
}

function assertPositiveDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw validationError('INVALID_ANIMATION_DURATION', 'Animation duration must be a positive number.', {
      propertyName: 'duration',
      value: duration,
    });
  }
}

function findPreviousKeyframe(keyframes: readonly Keyframe[], time: number): Keyframe | undefined {
  let previous: Keyframe | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time <= time) previous = keyframe;
    else break;
  }
  return previous;
}

function insertSorted(keyframes: Keyframe[], keyframe: Keyframe): void {
  let index = 0;
  while (index < keyframes.length) {
    const current = keyframes[index];
    if (!current || current.time > keyframe.time) break;
    index += 1;
  }
  keyframes.splice(index, 0, keyframe);
}
