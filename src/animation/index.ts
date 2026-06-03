import { EngineError, validationError } from '../shared/errors';
import type { Composition, Layer } from '../shared/project';
import type { MotionStateTarget, TimelineTweenAdapter } from '../shared/runtime';
import { createId } from '../shared/ids';
import { syncLayerToScrawl, type PreRenderHook } from '../integration/synchronization';
import {
  bindMotionTargetProperty,
  bindLayerMotionProperty,
  readNumericBinding,
  writeNumericBinding,
  type LayerMotionProperty,
  type NumericPropertyBinding,
} from '../shared/layer-properties';

export type AnimatableProperty = LayerMotionProperty;

export type Easing = string | ((progress: number) => number);

export type AnimationValues = Partial<Record<AnimatableProperty, number>>;

export type MotionTargetValues<TValues extends Record<string, number>> = Partial<TValues>;

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

export type ExpressionAudioProvider = () => ExpressionAudioContext | undefined;

type PropertyBinding = NumericPropertyBinding;

interface TweenRequest {
  readonly binding: PropertyBinding;
  readonly value: number;
}

interface TweenOptions {
  duration: number;
  ease: Easing;
  hold?: boolean;
  repeat?: number;
  yoyo?: boolean;
  onComplete?: () => void;
  position: number;
}

interface CompiledExpression extends Expression {
  evaluate: (context: ExpressionContext, helpers: ExpressionHelpers) => unknown;
  lastValidValue: number;
}

const defaultEase = 'power1.out';

export class AnimationController {
  readonly values: Record<string, number> = {};
  private readonly composition: Composition;
  private readonly keyframes = new Map<Layer, Map<AnimatableProperty, Keyframe[]>>();
  private readonly baselines = new Map<Layer, Map<AnimatableProperty, number>>();
  private readonly expressions = new Map<Layer, Map<AnimatableProperty, CompiledExpression>>();
  private readonly expressionErrors: EngineError[] = [];

  constructor(composition: Composition) {
    this.composition = composition;
    this.composition.registerMotionTarget(this);
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

    const propertyKeyframes = this.getPropertyKeyframes(layer, property);
    this.rememberBaseline(layer, property);
    const keyframe: Keyframe = {
      id: createId('keyframe'),
      property,
      time,
      value,
      easing: config.easing ?? defaultEase,
      hold: config.hold ?? false,
    };

    insertSorted(propertyKeyframes, keyframe);
    return keyframe;
  }

  editKeyframe(
    layer: Layer,
    property: AnimatableProperty,
    time: number,
    value: number,
    config: KeyframeConfig = {},
  ): Keyframe {
    const existing = this.findKeyframe(layer, property, time);
    if (existing === undefined) return this.addKeyframe(layer, property, time, value, config);

    existing.value = value;
    existing.easing = config.easing ?? existing.easing;
    existing.hold = config.hold ?? existing.hold;

    return existing;
  }

  findKeyframe(layer: Layer, property: AnimatableProperty, time: number): Keyframe | undefined {
    this.assertTimeInRange(time);
    return this.keyframes.get(layer)?.get(property)?.find((keyframe) => keyframe.time === time);
  }

  removeKeyframe(layer: Layer, keyframe: Keyframe): void {
    const layerKeyframes = this.keyframes.get(layer);
    const propertyKeyframes = layerKeyframes?.get(keyframe.property);
    if (!propertyKeyframes) return;

    const index = propertyKeyframes.indexOf(keyframe);
    if (index >= 0) propertyKeyframes.splice(index, 1);
    if (propertyKeyframes.length > 0) return;

    layerKeyframes?.delete(keyframe.property);
    this.baselines.get(layer)?.delete(keyframe.property);
    if (layerKeyframes?.size === 0) {
      this.keyframes.delete(layer);
      this.baselines.delete(layer);
    }
  }

  animate(layer: Layer, values: AnimationValues, config: AnimationConfig): Animation {
    this.assertLayerCanAnimate(layer);
    const requests: TweenRequest[] = [];
    for (const property of Object.keys(values) as AnimatableProperty[]) {
      const value = values[property];
      if (value === undefined) continue;
      requests.push({ binding: bindLayerMotionProperty(layer, property), value });
    }

    return this.animateBindings(requests, config);
  }

  animateTarget<TValues extends Record<string, number>>(
    target: MotionStateTarget<TValues>,
    values: MotionTargetValues<TValues>,
    config: AnimationConfig,
  ): Animation {
    this.composition.registerMotionTarget(target);
    const requests: TweenRequest[] = [];
    const keys = Object.keys(values) as Array<keyof TValues & string>;

    for (const key of keys) {
      const value = values[key];
      if (value === undefined) continue;
      requests.push({ binding: bindMotionTargetProperty(target, key), value });
    }

    return this.animateBindings(requests, config);
  }

  removeAnimationsForLayer(layer: Layer): void {
    this.keyframes.delete(layer);
    this.baselines.delete(layer);
    this.composition.timeline.killTweensOf?.(layer.transform.position);
    this.composition.timeline.killTweensOf?.(layer.transform.scale);
    this.composition.timeline.killTweensOf?.(layer.transform.anchor);
    this.composition.timeline.killTweensOf?.(layer);
  }

  removeLayer(layer: Layer): void {
    this.removeAnimationsForLayer(layer);
    this.expressions.delete(layer);
  }

  apply(): void {
    const time = this.composition.timeline.time();
    const touchedLayers = new Set<Layer>();
    for (const [layer, layerKeyframes] of this.keyframes) {
      if (layer.locked) continue;
      for (const [property, keyframes] of layerKeyframes) {
        const value = evaluateKeyframes(this.readBaseline(layer, property), keyframes, time, this.composition.timeline.parseEase);
        if (value === undefined) continue;
        writeBindingValue(bindLayerMotionProperty(layer, property), value);
        touchedLayers.add(layer);
      }
    }
    for (const layer of touchedLayers) syncLayerToScrawl(layer);
  }

  setExpression(layer: Layer, property: AnimatableProperty, source: string): Expression {
    this.assertLayerCanAnimate(layer);
    const binding = bindLayerMotionProperty(layer, property);
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
        const binding = bindLayerMotionProperty(layer, expression.property);
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

  private createTween(binding: PropertyBinding, value: number, options: TweenOptions): TimelineTweenAdapter {
    const vars: Record<string, unknown> = {
      [binding.key]: value,
      duration: options.duration,
      ease: options.ease,
      overwrite: false,
      immediateRender: options.hold === true,
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

  private animateBindings(requests: readonly TweenRequest[], config: AnimationConfig): Animation {
    assertPositiveDuration(config.duration);

    const tweens: TimelineTweenAdapter[] = [];
    const position = this.composition.timeline.time() + (config.delay ?? 0);

    for (const request of requests) {
      tweens.push(this.createTween(request.binding, request.value, createTweenOptions(config, position)));
    }

    return createAnimation(createId('animation'), tweens);
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

  private rememberBaseline(layer: Layer, property: AnimatableProperty): void {
    let layerBaselines = this.baselines.get(layer);
    if (!layerBaselines) {
      layerBaselines = new Map<AnimatableProperty, number>();
      this.baselines.set(layer, layerBaselines);
    }
    if (!layerBaselines.has(property)) layerBaselines.set(property, readBindingValue(bindLayerMotionProperty(layer, property)));
  }

  private readBaseline(layer: Layer, property: AnimatableProperty): number {
    const baseline = this.baselines.get(layer)?.get(property);
    if (baseline !== undefined) return baseline;
    return readBindingValue(bindLayerMotionProperty(layer, property));
  }
}

export function createAnimationController(composition: Composition): AnimationController {
  return new AnimationController(composition);
}

export function createExpressionRenderHook(
  controller: AnimationController,
  getAudio?: ExpressionAudioProvider,
): PreRenderHook {
  return {
    beforeRender(time: number): void {
      controller.applyExpressions(time, getAudio?.());
    },
  };
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
  const value = readNumericBinding(binding);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError('EXPRESSION_PROPERTY_NOT_NUMERIC', 'Expression property value must be numeric.', {
      propertyName: binding.key,
      value,
    });
  }
  return value;
}

function writeBindingValue(binding: PropertyBinding, value: number): void {
  writeNumericBinding(binding, value);
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

function createTweenOptions(config: AnimationConfig, position: number): TweenOptions {
  const options: TweenOptions = {
    duration: config.duration,
    ease: config.easing ?? defaultEase,
    position,
  };

  if (config.repeat !== undefined) options.repeat = config.repeat;
  if (config.yoyo !== undefined) options.yoyo = config.yoyo;
  if (config.onComplete !== undefined) options.onComplete = config.onComplete;

  return options;
}

function assertPositiveDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw validationError('INVALID_ANIMATION_DURATION', 'Animation duration must be a positive number.', {
      propertyName: 'duration',
      value: duration,
    });
  }
}

function evaluateKeyframes(
  baseline: number,
  keyframes: readonly Keyframe[],
  time: number,
  parseEase?: (ease: string) => ((progress: number) => number) | undefined,
): number | undefined {
  if (keyframes.length === 0) return undefined;
  const first = keyframes[0];
  if (first === undefined) return undefined;
  if (time < first.time) return first.hold ? baseline : interpolateValue(baseline, first.value, time, 0, first.time, first.easing, parseEase);

  let previousValue = baseline;
  let previousTime = 0;
  for (const keyframe of keyframes) {
    if (time < keyframe.time) {
      if (keyframe.hold) return previousValue;
      return interpolateValue(previousValue, keyframe.value, time, previousTime, keyframe.time, keyframe.easing, parseEase);
    }
    previousValue = keyframe.value;
    previousTime = keyframe.time;
  }
  return previousValue;
}

function interpolateValue(
  start: number,
  end: number,
  time: number,
  startTime: number,
  endTime: number,
  easing: Easing,
  parseEase?: (ease: string) => ((progress: number) => number) | undefined,
): number {
  if (endTime <= startTime) return end;
  const progress = Math.min(Math.max((time - startTime) / (endTime - startTime), 0), 1);
  const eased = typeof easing === 'function' ? easing(progress) : (parseEase?.(easing)?.(progress) ?? progress);
  return start + (end - start) * eased;
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
