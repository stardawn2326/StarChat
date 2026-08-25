import {
  LIVE2D_PARAMETER_SEMANTICS,
  createParameterBindings,
  type Live2DAdapterConfig,
  type Live2DCapabilityManifest,
  type Live2DParameterBinding,
  type Live2DParameterCapability,
  type Live2DParameterSemantic
} from '../../shared/live2d';

export interface RuntimeParameterDescriptor {
  id: string;
  name?: string;
  min?: number;
  max?: number;
  default?: number;
}

export type { Live2DCapabilityManifest, Live2DParameterCapability } from '../../shared/live2d';

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s_\-:./\\]/gu, '');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function matches(binding: Live2DParameterBinding, descriptor: RuntimeParameterDescriptor): boolean {
  const aliases = unique([binding.targetId, ...(binding.aliases ?? [])]).map(normalize);
  return aliases.includes(normalize(descriptor.id)) || (descriptor.name ? aliases.includes(normalize(descriptor.name)) : false);
}

export function buildLive2DCapabilityManifest(
  modelIdentity: string | null,
  runtimeParameters: readonly RuntimeParameterDescriptor[],
  adapter: Live2DAdapterConfig | null
): Live2DCapabilityManifest {
  const parameters = {} as Record<Live2DParameterSemantic, Live2DParameterCapability>;
  const missing: Live2DParameterSemantic[] = [];
  const defaultBindings = createParameterBindings([]);

  for (const semantic of LIVE2D_PARAMETER_SEMANTICS) {
    const binding = adapter?.parameterBindings[semantic] ?? defaultBindings[semantic];
    const recommended = binding?.recommendedRange ?? { min: -1, max: 1, default: 0 };
    const descriptor = runtimeParameters.find((candidate) => binding ? matches(binding, candidate) : false);
    const available = Boolean(descriptor) || Boolean(binding?.available && runtimeParameters.length === 0);
    const targetId = descriptor?.id ?? binding?.targetId ?? semantic;
    const min = descriptor ? finite(descriptor.min, recommended.min) : recommended.min;
    const max = descriptor ? finite(descriptor.max, recommended.max) : recommended.max;
    const safeMin = Math.min(min, max);
    const safeMax = Math.max(min, max);
    const defaultValue = Math.min(safeMax, Math.max(safeMin, descriptor
      ? finite(descriptor.default, recommended.default)
      : recommended.default));
    const aliases = unique([
      binding?.targetId ?? '',
      ...(binding?.aliases ?? []),
      descriptor?.id ?? '',
      descriptor?.name ?? ''
    ]);
    parameters[semantic] = {
      semantic,
      targetId,
      aliases,
      available,
      min: safeMin,
      max: safeMax,
      default: defaultValue,
      source: descriptor ? 'runtime' : available ? 'adapter' : 'missing'
    };
    if (!available) missing.push(semantic);
  }

  return { modelIdentity, parameters, missing };
}

export function clampRuntimeParameter(value: number, capability: Live2DParameterCapability): number {
  return Math.min(capability.max, Math.max(capability.min, Number.isFinite(value) ? value : capability.default));
}
