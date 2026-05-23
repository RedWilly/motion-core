export type EngineErrorCategory = 'validation' | 'resource' | 'runtime' | 'capability';

export interface EngineErrorContext {
  filePath?: string;
  layerName?: string;
  propertyName?: string;
  value?: unknown;
}

export class EngineError extends Error {
  readonly code: string;
  readonly category: EngineErrorCategory;
  readonly context: EngineErrorContext | undefined;
  readonly suggestion: string | undefined;
  readonly originalError?: unknown;

  constructor(options: {
    code: string;
    message: string;
    category: EngineErrorCategory;
    context?: EngineErrorContext;
    suggestion?: string;
    originalError?: unknown;
  }) {
    super(options.message);
    this.name = 'EngineError';
    this.code = options.code;
    this.category = options.category;
    this.context = options.context;
    this.suggestion = options.suggestion;
    this.originalError = options.originalError;
  }
}

export function validationError(
  code: string,
  message: string,
  context?: EngineErrorContext,
): EngineError {
  return context === undefined
    ? new EngineError({ code, message, category: 'validation' })
    : new EngineError({ code, message, category: 'validation', context });
}

export function capabilityError(
  code: string,
  message: string,
  suggestion?: string,
): EngineError {
  return suggestion === undefined
    ? new EngineError({ code, message, category: 'capability' })
    : new EngineError({ code, message, category: 'capability', suggestion });
}
