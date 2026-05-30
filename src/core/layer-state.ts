import { capabilityError } from '../shared/errors';
import type { Layer, LayerConfig, ShapeLayerState, TextLayerState } from '../shared/project';

export function createShapeState(
  layerConfig: LayerConfig,
  entity: { readonly parts?: Layer['scrawlEntity']['parts']; set(values: Readonly<Record<string, unknown>>): unknown },
): ShapeLayerState | undefined {
  const config = layerConfig.shape;
  if (config === undefined) return undefined;
  if (config.fill === undefined && config.stroke === undefined) return undefined;

  const fillEntity = entity.parts?.fill;
  const strokeEntity = entity.parts?.stroke;
  if (fillEntity === undefined || strokeEntity === undefined) {
    throw capabilityError(
      'SHAPE_PARTS_UNAVAILABLE',
      'Typed shape fill/stroke animation requires separate Scrawl entity parts.',
      'Create shape layers through the Scrawl adapter or provide an entity factory that returns fill and stroke parts.',
    );
  }
  const fillColor = config.fill?.color ?? config.fillStyle ?? 'rgb(0 0 0 / 1)';
  const strokeColor = config.stroke?.color ?? config.strokeStyle ?? 'rgb(0 0 0 / 1)';
  const fill = {
    color: fillColor,
    values: {
      opacity: config.fill?.opacity ?? 1,
    },
    apply() {},
  };
  const stroke = {
    color: strokeColor,
    values: {
      opacity: config.stroke?.opacity ?? (config.stroke === undefined && config.strokeStyle === undefined ? 0 : 1),
      width: config.stroke?.width ?? config.lineWidth ?? 1,
    },
    apply() {},
  };
  let previousFillOpacity = Number.NaN;
  let previousStrokeOpacity = Number.NaN;
  let previousStrokeWidth = Number.NaN;

  const shape: ShapeLayerState = {
    fill,
    stroke,
    apply(): void {
      const fillOpacity = clampUnit(fill.values.opacity);
      const strokeOpacity = clampUnit(stroke.values.opacity);
      const strokeWidth = Math.max(stroke.values.width, 0);
      if (previousFillOpacity !== fillOpacity) {
        previousFillOpacity = fillOpacity;
        fillEntity.set({ globalAlpha: fillOpacity, visibility: fillOpacity > 0 });
      }
      if (previousStrokeOpacity !== strokeOpacity || previousStrokeWidth !== strokeWidth) {
        previousStrokeOpacity = strokeOpacity;
        previousStrokeWidth = strokeWidth;
        strokeEntity.set({
          globalAlpha: strokeOpacity,
          lineWidth: strokeWidth,
          visibility: strokeOpacity > 0 && strokeWidth > 0,
        });
      }
    },
  };

  fill.apply = shape.apply;
  stroke.apply = shape.apply;
  return shape;
}

export function createTextState(layerConfig: LayerConfig, entity: Layer['scrawlEntity']): TextLayerState | undefined {
  if (layerConfig.textMode !== 'enhanced' && layerConfig.enhancedText === undefined) return undefined;

  const config = layerConfig.enhancedText;
  const text: TextLayerState = {
    mode: 'enhanced',
    values: {
      alignment: config?.alignment ?? 0,
      lineAdjustment: config?.lineAdjustment ?? 0,
      lineSpacing: config?.lineSpacing ?? 1,
      lineWidth: config?.lineWidth ?? 1,
      pathPosition: config?.pathPosition ?? 0,
      startTextOnLine: config?.startTextOnLine ?? 0,
    },
    apply() {},
  };
  const previousValues: TextLayerState['values'] = {
    alignment: Number.NaN,
    lineAdjustment: Number.NaN,
    lineSpacing: Number.NaN,
    lineWidth: Number.NaN,
    pathPosition: Number.NaN,
    startTextOnLine: Number.NaN,
  };

  text.apply = (): void => {
    const updates: Partial<TextLayerState['values']> = {};
    let changed = false;

    for (const key of Object.keys(text.values) as Array<keyof TextLayerState['values']>) {
      const value = text.values[key] ?? 0;
      if (previousValues[key] === value) continue;

      previousValues[key] = value;
      updates[key] = value;
      changed = true;
    }

    if (changed) entity.set(updates);
  };

  return text;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
