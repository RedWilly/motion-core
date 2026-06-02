import type { AnimationController, KeyframeConfig } from '../animation';
import type { Composition, Layer } from '../shared';
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
