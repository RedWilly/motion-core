import { createAnimationController, type AnimationController, type KeyframeConfig } from '../animation';
import { validationError } from '../shared/errors';
import type {
  Composition,
  Layer,
  LayerEffectState,
  LayerMaskConfig,
  LayerMaskState,
  MotionStateTarget,
  ShapeFillState,
  ShapeStrokeState,
  TextLayerMotionValues,
  TextLayerState,
} from '../shared';
import {
  bindLayerMotionProperty,
  writeNumericBinding,
  type LayerMotionProperty,
} from '../shared/layer-properties';

export type LiveEditParseMode =
  | 'float'
  | 'int'
  | 'round'
  | 'roundDown'
  | 'roundUp'
  | 'boolean'
  | ((value: string, input: LiveEditInput) => number);

export interface LiveEditInput {
  readonly value: string;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface LiveEditBindingOptions {
  readonly event?: string | readonly string[];
  readonly parse?: LiveEditParseMode;
  readonly edit?: LiveEditOptions;
  readonly render?: boolean;
}

export interface LiveEditSessionOptions {
  readonly schedule?: (callback: () => void) => () => void;
  readonly render?: boolean;
}

export type LiveEditMode = 'set' | 'autoKey';

export interface LiveEditOptions {
  readonly mode?: LiveEditMode;
  readonly animation?: AnimationController;
  readonly keyframe?: KeyframeConfig;
  readonly time?: number;
}

export interface LiveEditSession {
  bindInput<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  setValue<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: LiveEditOptions & { readonly render?: boolean },
  ): void;
  bindLayerInput(
    input: LiveEditInput,
    layer: Layer,
    property: LayerMotionProperty,
    options?: LiveEditBindingOptions,
  ): () => void;
  setLayerProperty(
    layer: Layer,
    property: LayerMotionProperty,
    value: number,
    options?: LiveEditOptions & { readonly render?: boolean },
  ): void;
  flush(): void;
  dispose(): void;
}

export type EditorLayerProperty = LayerMotionProperty;
export type EditorShapeFillProperty = keyof ShapeFillState['values'] & string;
export type EditorShapeStrokeProperty = keyof ShapeStrokeState['values'] & string;
export type EditorTextProperty = keyof TextLayerMotionValues & string;

export type EditorEditOptions = Omit<LiveEditOptions, 'animation'> & {
  readonly render?: boolean;
};

export type EditorBindingOptions = Omit<LiveEditBindingOptions, 'edit'> & {
  readonly edit?: EditorEditOptions;
};

export interface EditorSessionOptions extends LiveEditSessionOptions {
  readonly animation?: AnimationController;
}

export interface EditorSession {
  readonly animation: AnimationController;
  readonly live: LiveEditSession;
  bindLayerInput(
    input: LiveEditInput,
    layer: Layer,
    property: EditorLayerProperty,
    options?: EditorBindingOptions,
  ): () => void;
  editLayer(layer: Layer, property: EditorLayerProperty, value: number, options?: EditorEditOptions): void;
  bindEffectInput<TKey extends keyof LayerEffectState['values'] & string>(
    input: LiveEditInput,
    effect: LayerEffectState,
    key: TKey,
    options?: EditorBindingOptions,
  ): () => void;
  editEffect<TKey extends keyof LayerEffectState['values'] & string>(
    effect: LayerEffectState,
    key: TKey,
    value: number,
    options?: EditorEditOptions,
  ): void;
  bindShapeFillInput(
    input: LiveEditInput,
    layer: Layer,
    property: EditorShapeFillProperty,
    options?: EditorBindingOptions,
  ): () => void;
  editShapeFill(layer: Layer, property: EditorShapeFillProperty, value: number, options?: EditorEditOptions): void;
  bindShapeStrokeInput(
    input: LiveEditInput,
    layer: Layer,
    property: EditorShapeStrokeProperty,
    options?: EditorBindingOptions,
  ): () => void;
  editShapeStroke(layer: Layer, property: EditorShapeStrokeProperty, value: number, options?: EditorEditOptions): void;
  bindTextInput(
    input: LiveEditInput,
    layer: Layer,
    property: EditorTextProperty,
    options?: EditorBindingOptions,
  ): () => void;
  editText(layer: Layer, property: EditorTextProperty, value: number, options?: EditorEditOptions): void;
  bindTargetInput<TValues extends Record<string, number>, TKey extends keyof TValues & string>(
    input: LiveEditInput,
    target: MotionStateTarget<TValues>,
    key: TKey,
    options?: EditorBindingOptions,
  ): () => void;
  editTarget<TValues extends Record<string, number>, TKey extends keyof TValues & string>(
    target: MotionStateTarget<TValues>,
    key: TKey,
    value: number,
    options?: EditorEditOptions,
  ): void;
  setMask(layer: Layer, config: LayerMaskConfig): LayerMaskState;
  setLayerMask(
    targetLayer: Layer,
    sourceLayer: Layer,
    config?: Omit<LayerMaskConfig, 'sourceLayerId'>,
  ): LayerMaskState;
  clearMask(layer: Layer): void;
  play(): void;
  pause(): void;
  seek(time: number): void;
  syncFrame(time?: number): void;
  flush(): void;
  dispose(): void;
}

interface LiveEditBinding {
  dispose(): void;
}

const defaultEvents = ['input', 'change'] as const;

export function createLiveEditSession(
  composition: Composition,
  options: LiveEditSessionOptions = {},
): LiveEditSession {
  const schedule = options.schedule ?? defaultSchedule;
  const defaultRender = options.render ?? true;
  const bindings: LiveEditBinding[] = [];
  let pendingCancel: (() => void) | null = null;
  let disposed = false;
  let renderPending = false;

  const queue = (render: boolean): void => {
    if (disposed) return;
    renderPending ||= render;
    if (pendingCancel !== null) return;
    pendingCancel = schedule(flush);
  };

  const flush = (): void => {
    if (disposed) return;
    pendingCancel = null;
    composition.syncFrame();
    if (renderPending) void composition.renderer.renderFrame();
    renderPending = false;
  };

  const session: LiveEditSession = {
    bindInput(input, values, key, bindingOptions = {}) {
      if (disposed) return noop;
      const events = normalizeEvents(bindingOptions.event);
      const parse = bindingOptions.parse ?? 'float';
      const listener = (): void => {
        this.setValue(
          values,
          key,
          parseInputValue(input, parse),
          {
            ...bindingOptions.edit,
            ...(bindingOptions.render === undefined ? null : { render: bindingOptions.render }),
          },
        );
      };

      for (const event of events) input.addEventListener(event, listener);
      const binding = {
        dispose(): void {
          for (const event of events) input.removeEventListener(event, listener);
        },
      };
      bindings.push(binding);
      return () => removeBinding(bindings, binding);
    },

    setValue(values, key, value, setOptions = {}): void {
      if (!Number.isFinite(value)) return;
      if (values[key] === value) return;
      values[key] = value;
      if (setOptions.mode === 'autoKey') {
        const time = setOptions.time ?? composition.timeline.time();
        composition.timeline.set?.(values, { [key]: value }, time);
      }
      queue(setOptions.render ?? defaultRender);
    },

    bindLayerInput(input, layer, property, bindingOptions = {}) {
      if (disposed) return noop;
      const events = normalizeEvents(bindingOptions.event);
      const parse = bindingOptions.parse ?? 'float';
      const listener = (): void => {
        this.setLayerProperty(
          layer,
          property,
          parseInputValue(input, parse),
          {
            ...bindingOptions.edit,
            ...(bindingOptions.render === undefined ? null : { render: bindingOptions.render }),
          },
        );
      };

      for (const event of events) input.addEventListener(event, listener);
      const binding = {
        dispose(): void {
          for (const event of events) input.removeEventListener(event, listener);
        },
      };
      bindings.push(binding);
      return () => removeBinding(bindings, binding);
    },

    setLayerProperty(layer, property, value, setOptions = {}): void {
      if (!Number.isFinite(value)) return;
      const binding = bindLayerMotionProperty(layer, property);
      if (binding.target[binding.key] === value) return;

      if (setOptions.mode === 'autoKey') {
        setOptions.animation?.editKeyframe(
          layer,
          property,
          setOptions.time ?? composition.timeline.time(),
          value,
          setOptions.keyframe,
        );
      }

      writeNumericBinding(binding, value);
      queue(setOptions.render ?? defaultRender);
    },

    flush,

    dispose(): void {
      if (disposed) return;
      disposed = true;
      pendingCancel?.();
      pendingCancel = null;
      renderPending = false;
      while (bindings.length > 0) bindings.pop()?.dispose();
    },
  };

  return session;
}

export function createEditorSession(
  composition: Composition,
  options: EditorSessionOptions = {},
): EditorSession {
  const animation = options.animation ?? createAnimationController(composition);
  const live = createLiveEditSession(composition, options);

  const editLayerOptions = (edit?: EditorEditOptions): LiveEditOptions & { readonly render?: boolean } => ({
    ...edit,
    animation,
  });

  return {
    animation,
    live,

    bindLayerInput(input, layer, property, options = {}) {
      return live.bindLayerInput(input, layer, property, {
        ...options,
        edit: editLayerOptions(options.edit),
      });
    },

    editLayer(layer, property, value, options = {}) {
      live.setLayerProperty(layer, property, value, editLayerOptions(options));
    },

    bindEffectInput(input, effect, key, options = {}) {
      return live.bindInput(input, effect.values, key, options);
    },

    editEffect(effect, key, value, options = {}) {
      live.setValue(effect.values, key, value, options);
    },

    bindShapeFillInput(input, layer, property, options = {}) {
      return live.bindInput(input, requireShape(layer).fill.values, property, options);
    },

    editShapeFill(layer, property, value, options = {}) {
      live.setValue(requireShape(layer).fill.values, property, value, options);
    },

    bindShapeStrokeInput(input, layer, property, options = {}) {
      return live.bindInput(input, requireShape(layer).stroke.values, property, options);
    },

    editShapeStroke(layer, property, value, options = {}) {
      live.setValue(requireShape(layer).stroke.values, property, value, options);
    },

    bindTextInput(input, layer, property, options = {}) {
      return live.bindInput(input, requireText(layer).values, property, options);
    },

    editText(layer, property, value, options = {}) {
      live.setValue(requireText(layer).values, property, value, options);
    },

    bindTargetInput(input, target, key, options = {}) {
      return live.bindInput(input, target.values, key, options);
    },

    editTarget(target, key, value, options = {}) {
      live.setValue(target.values, key, value, options);
    },

    setMask(layer, config) {
      return composition.setMask(layer, config);
    },

    setLayerMask(targetLayer, sourceLayer, config) {
      return composition.setLayerMask(targetLayer, sourceLayer, config);
    },

    clearMask(layer) {
      composition.clearMask(layer);
    },

    play() {
      composition.play();
    },

    pause() {
      composition.pause();
    },

    seek(time) {
      composition.seek(time);
    },

    syncFrame(time) {
      composition.syncFrame(time);
    },

    flush() {
      live.flush();
    },

    dispose() {
      live.dispose();
    },
  };
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

function removeBinding(bindings: LiveEditBinding[], binding: LiveEditBinding): void {
  const index = bindings.indexOf(binding);
  if (index < 0) return;
  bindings.splice(index, 1);
  binding.dispose();
}

function noop(): void {
  return undefined;
}

function requireShape(layer: Layer): NonNullable<Layer['shape']> {
  if (layer.shape !== undefined) return layer.shape;
  throw validationError('LAYER_SHAPE_STATE_UNAVAILABLE', 'Layer does not expose editable shape state.', {
    layerName: layer.name,
    propertyName: 'shape',
  });
}

function requireText(layer: Layer): TextLayerState {
  if (layer.textState !== undefined) return layer.textState;
  throw validationError('LAYER_TEXT_STATE_UNAVAILABLE', 'Layer does not expose editable text state.', {
    layerName: layer.name,
    propertyName: 'textState',
  });
}
