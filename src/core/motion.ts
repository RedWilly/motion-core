import { EngineError, validationError } from '../shared/errors';
import { createId } from '../shared/ids';
import {
  bindLayerMotionProperty,
  bindMotionTargetProperty,
  readNumericBinding,
  writeNumericBinding,
  type NumericPropertyBinding,
} from '../shared/layer-properties';
import type {
  AnimatableProperty,
  Animation,
  AnimationConfig,
  AnimationValues,
  Composition,
  Easing,
  Expression,
  ExpressionApplyResult,
  ExpressionAudioContext,
  ExpressionAudioProvider,
  ExpressionContext,
  ExpressionEvaluator,
  ExpressionHelpers,
  Keyframe,
  KeyframeConfig,
  Layer,
  LiveEditBindingOptions,
  LiveEditInput,
  LiveEditOptions,
  LiveEditParseMode,
  LiveEditSession,
  LiveEditSessionOptions,
  MotionSetOptions,
  MotionTargetValues,
} from '../shared/project';
import type { MotionStateTarget, TimelineTweenAdapter } from '../shared/runtime';
import { syncLayerToScrawl, type PreRenderHook } from '../integration/synchronization';

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
  lastValidValue: number;
}

interface LiveEditBinding {
  dispose(): void;
}

const defaultEase = 'power1.out';
const defaultEvents = ['input', 'change'] as const;
const motionControllers = new WeakMap<Composition, AnimationController>();

export class AnimationController implements MotionStateTarget, LiveEditSession {
  readonly values: Record<string, number> = {};
  private readonly composition: Composition;
  private readonly keyframes = new Map<Layer, Map<AnimatableProperty, Keyframe[]>>();
  private readonly baselines = new Map<Layer, Map<AnimatableProperty, number>>();
  private readonly expressions = new Map<Layer, Map<AnimatableProperty, CompiledExpression>>();
  private readonly expressionErrors: EngineError[] = [];
  private readonly touchedLayers = new Set<Layer>();
  private readonly bindings: LiveEditBinding[] = [];
  private readonly schedule: (callback: () => void) => () => void;
  private readonly defaultRender: boolean;
  private readonly compositionOwned: boolean;
  private readonly unregisterMotionTarget: () => void;
  private pendingCancel: (() => void) | null = null;
  private pending = false;
  private disposed = false;
  private renderPending = false;

  constructor(composition: Composition, options: LiveEditSessionOptions = {}, compositionOwned = true) {
    this.composition = composition;
    this.schedule = options.schedule ?? defaultSchedule;
    this.defaultRender = options.render ?? true;
    this.compositionOwned = compositionOwned;
    this.unregisterMotionTarget = this.composition.registerMotionTarget(this);
    if (compositionOwned && !motionControllers.has(composition)) motionControllers.set(composition, this);
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

  key(
    layer: Layer,
    property: AnimatableProperty,
    time: number,
    value: number,
    config: KeyframeConfig = {},
  ): Keyframe {
    return this.editKeyframe(layer, property, time, value, config);
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

  set(layer: Layer, property: AnimatableProperty, value: number, options?: MotionSetOptions): void;
  set<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: MotionSetOptions,
  ): void;
  set(
    target: Layer | Record<string, number>,
    property: AnimatableProperty | string,
    value: number,
    options: MotionSetOptions = {},
  ): void {
    if (!Number.isFinite(value)) return;

    if (isLayer(target)) {
      this.setLayerProperty(target, property as AnimatableProperty, value, options);
      return;
    }

    this.setValue(target, property, value, options);
  }

  bind(input: LiveEditInput, layer: Layer, property: AnimatableProperty, options?: LiveEditBindingOptions): () => void;
  bind<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  bind(
    input: LiveEditInput,
    target: Layer | Record<string, number>,
    property: AnimatableProperty | string,
    options: LiveEditBindingOptions = {},
  ): () => void {
    if (isLayer(target)) return this.bindLayerInput(input, target, property as AnimatableProperty, options);
    return this.bindInput(input, target, property, options);
  }

  bindInput<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options: LiveEditBindingOptions = {},
  ): () => void {
    if (this.disposed) return noop;
    const events = normalizeEvents(options.event);
    const parse = options.parse ?? 'float';
    const listener = (): void => {
      this.setValue(values, key, parseInputValue(input, parse), {
        ...options.edit,
        ...(options.render === undefined ? null : { render: options.render }),
      });
    };

    for (const event of events) input.addEventListener(event, listener);
    const binding = {
      dispose(): void {
        for (const event of events) input.removeEventListener(event, listener);
      },
    };
    this.bindings.push(binding);
    return () => this.removeBinding(binding);
  }

  setValue<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options: MotionSetOptions = {},
  ): void {
    if (!Number.isFinite(value)) return;
    if (values[key] === value) return;
    values[key] = value;
    if (options.mode === 'autoKey') {
      const time = options.time ?? this.composition.timeline.time();
      this.composition.timeline.set?.(values, { [key]: value }, time);
    }
    this.queue(options.render ?? this.defaultRender);
  }

  bindLayerInput(
    input: LiveEditInput,
    layer: Layer,
    property: AnimatableProperty,
    options: LiveEditBindingOptions = {},
  ): () => void {
    if (this.disposed) return noop;
    const events = normalizeEvents(options.event);
    const parse = options.parse ?? 'float';
    const listener = (): void => {
      this.setLayerProperty(layer, property, parseInputValue(input, parse), {
        ...options.edit,
        ...(options.render === undefined ? null : { render: options.render }),
      });
    };

    for (const event of events) input.addEventListener(event, listener);
    const binding = {
      dispose(): void {
        for (const event of events) input.removeEventListener(event, listener);
      },
    };
    this.bindings.push(binding);
    return () => this.removeBinding(binding);
  }

  setLayerProperty(
    layer: Layer,
    property: AnimatableProperty,
    value: number,
    options: MotionSetOptions = {},
  ): void {
    if (!Number.isFinite(value)) return;
    const binding = bindLayerMotionProperty(layer, property);
    if (binding.target[binding.key] === value) return;

    if (options.mode === 'autoKey') {
      const controller = options.animation ?? this;
      controller.editKeyframe(
        layer,
        property,
        options.time ?? this.composition.timeline.time(),
        value,
        options.keyframe,
      );
    }

    writeNumericBinding(binding, value);
    this.queue(options.render ?? this.defaultRender);
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
    this.touchedLayers.clear();
    for (const [layer, layerKeyframes] of this.keyframes) {
      if (layer.locked) continue;
      for (const [property, keyframes] of layerKeyframes) {
        const value = evaluateKeyframes(this.readBaseline(layer, property), keyframes, time, this.composition.timeline.parseEase);
        if (value === undefined) continue;
        writeBindingValue(bindLayerMotionProperty(layer, property), value);
        this.touchedLayers.add(layer);
      }
    }
    for (const layer of this.touchedLayers) syncLayerToScrawl(layer);
    this.touchedLayers.clear();
  }

  setExpression(layer: Layer, property: AnimatableProperty, evaluator: ExpressionEvaluator): Expression {
    this.assertLayerCanAnimate(layer);
    const binding = bindLayerMotionProperty(layer, property);
    const compiled: CompiledExpression = {
      id: createId('expression'),
      layer,
      property,
      evaluator,
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
    this.touchedLayers.clear();

    for (const [layer, layerExpressions] of this.expressions) {
      if (layer.locked) continue;

      for (const expression of layerExpressions.values()) {
        const binding = bindLayerMotionProperty(layer, expression.property);
        const context = createExpressionContext(this.composition, layer, expression.property, binding, time, audio);
        try {
          const value = expression.evaluator(context, createExpressionHelpers(time, expression.id));
          const numericValue = numberExpressionResult(value, expression.property);
          writeBindingValue(binding, numericValue);
          expression.lastValidValue = numericValue;
          applied += 1;
        } catch (error) {
          writeBindingValue(binding, expression.lastValidValue);
          this.expressionErrors.push(createExpressionError(expression, error));
        }

        this.touchedLayers.add(layer);
      }
    }

    for (const layer of this.touchedLayers) syncLayerToScrawl(layer);
    this.touchedLayers.clear();

    return { applied, errors: [...this.expressionErrors] };
  }

  getExpressionErrors(): readonly EngineError[] {
    return this.expressionErrors;
  }

  flush(): void {
    if (this.disposed) return;
    this.pending = false;
    this.pendingCancel = null;
    this.composition.syncFrame();
    if (this.renderPending) void this.composition.renderer.renderFrame();
    this.renderPending = false;
  }

  dispose(): void {
    if (this.disposed && !this.compositionOwned) return;
    this.pendingCancel?.();
    this.pending = false;
    this.pendingCancel = null;
    this.renderPending = false;
    while (this.bindings.length > 0) this.bindings.pop()?.dispose();
    if (!this.compositionOwned) {
      this.disposed = true;
      this.unregisterMotionTarget();
    }
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

  private queue(render: boolean): void {
    if (this.disposed) return;
    this.renderPending ||= render;
    if (this.pending) return;
    this.pending = true;
    const cancel = this.schedule(() => this.flush());
    this.pendingCancel = this.pending ? cancel : null;
  }

  private removeBinding(binding: LiveEditBinding): void {
    const index = this.bindings.indexOf(binding);
    if (index < 0) return;
    this.bindings.splice(index, 1);
    binding.dispose();
  }
}

export function getMotionController(composition: Composition): AnimationController {
  const existing = motionControllers.get(composition);
  if (existing !== undefined) return existing;
  return new AnimationController(composition);
}

export function createAnimationController(composition: Composition): AnimationController {
  return getMotionController(composition);
}

export function setMotionValue(
  controller: AnimationController,
  target: Layer | Record<string, number>,
  property: AnimatableProperty | string,
  value: number,
  options: MotionSetOptions = {},
): void {
  if (isLayer(target)) {
    controller.setLayerProperty(target, property as AnimatableProperty, value, options);
    return;
  }

  controller.setValue(target, property, value, options);
}

export function bindMotionInput(
  controller: AnimationController,
  input: LiveEditInput,
  target: Layer | Record<string, number>,
  property: AnimatableProperty | string,
  options: LiveEditBindingOptions = {},
): () => void {
  if (isLayer(target)) return controller.bindLayerInput(input, target, property as AnimatableProperty, options);
  return controller.bindInput(input, target, property, options);
}

export function createLiveEditSession(
  composition: Composition,
  options: LiveEditSessionOptions = {},
): LiveEditSession {
  return new AnimationController(composition, options, false);
}

export function createExpressionRenderHook(
  controller: Pick<AnimationController, 'applyExpressions'>,
  getAudio?: ExpressionAudioProvider,
): PreRenderHook {
  return {
    beforeRender(time: number): void {
      controller.applyExpressions(time, getAudio?.());
    },
  };
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
  const errorMessage = error instanceof Error ? `: ${error.message}` : '';
  return new EngineError({
    code: 'EXPRESSION_EVALUATION_FAILED',
    message: `Expression failed for ${expression.layer.name}.${expression.property}${errorMessage}`,
    category: 'runtime',
    context: {
      layerName: expression.layer.name,
      propertyName: expression.property,
    },
    originalError: error,
  });
}

function expressionView(expression: CompiledExpression): Expression {
  return {
    id: expression.id,
    layer: expression.layer,
    property: expression.property,
    evaluator: expression.evaluator,
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

function normalizeEvents(event: LiveEditBindingOptions['event']): readonly string[] {
  if (event === undefined) return defaultEvents;
  return typeof event === 'string' ? [event] : event;
}

function parseInputValue(input: LiveEditInput, parse: LiveEditParseMode): number {
  if (typeof parse === 'function') return parse(input.value, input);

  switch (parse) {
    case 'int':
      return parseInt(input.value, 10);
    case 'round':
      return Math.round(Number(input.value));
    case 'roundDown':
      return Math.floor(Number(input.value));
    case 'roundUp':
      return Math.ceil(Number(input.value));
    case 'boolean':
      return input.value === 'true' || Number(input.value) > 0 ? 1 : 0;
    case 'float':
      return parseFloat(input.value);
  }
}

function defaultSchedule(callback: () => void): () => void {
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;

  if (request !== undefined && cancel !== undefined) {
    const id = request(callback);
    return () => cancel(id);
  }

  const id = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(id);
}

function isLayer(value: Layer | Record<string, number>): value is Layer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'transform' in value &&
    'scrawlEntity' in value &&
    'scrawlState' in value
  );
}

function noop(): void {
  return undefined;
}
