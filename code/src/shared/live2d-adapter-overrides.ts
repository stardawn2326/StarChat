import { applyLive2DAdapterOverride, type Live2DAdapterConfig, type Live2DAdapterOverride, type Live2DParameterSemantic } from './live2d';

type SemanticOverride = NonNullable<Live2DAdapterOverride['semanticMappings']>[string];

function cleanOverride(adapter: Live2DAdapterConfig, source: Live2DAdapterOverride | null | undefined): Live2DAdapterOverride | null {
  const parameterBindings = Object.fromEntries(
    Object.entries(source?.parameterBindings ?? {}).filter(([, targetId]) => typeof targetId === 'string' && targetId.trim())
  ) as NonNullable<Live2DAdapterOverride['parameterBindings']>;
  const semanticMappings = Object.fromEntries(
    Object.entries(source?.semanticMappings ?? {}).filter(([, route]) => Boolean(route && typeof route === 'object'))
  ) as NonNullable<Live2DAdapterOverride['semanticMappings']>;
  if (Object.keys(parameterBindings).length === 0 && Object.keys(semanticMappings).length === 0) return null;
  return {
    schemaVersion: 1,
    sourceEntryPath: adapter.sourceEntryPath,
    ...(Object.keys(parameterBindings).length > 0 ? { parameterBindings } : {}),
    ...(Object.keys(semanticMappings).length > 0 ? { semanticMappings } : {}),
    updatedAt: Date.now()
  };
}

function currentDelta(adapter: Live2DAdapterConfig, baseline: Live2DAdapterConfig): Live2DAdapterOverride | null {
  const source = adapter.overrides;
  if (!source || source.schemaVersion !== 1 || source.sourceEntryPath !== baseline.sourceEntryPath) return null;
  return cleanOverride(baseline, source);
}

function resolveFromDelta(baseline: Live2DAdapterConfig, delta: Live2DAdapterOverride | null): Live2DAdapterConfig {
  const { overrides: _ignored, ...automatic } = baseline;
  return delta ? applyLive2DAdapterOverride(automatic, delta) : automatic;
}

function withSemanticDelta(
  adapter: Live2DAdapterConfig,
  baseline: Live2DAdapterConfig,
  name: string,
  change: SemanticOverride | null
): Live2DAdapterConfig {
  const delta = currentDelta(adapter, baseline) ?? { schemaVersion: 1 as const, sourceEntryPath: baseline.sourceEntryPath, updatedAt: Date.now() };
  const semanticMappings = { ...(delta.semanticMappings ?? {}) };
  if (change) semanticMappings[name] = change;
  else delete semanticMappings[name];
  return resolveFromDelta(baseline, cleanOverride(baseline, { ...delta, semanticMappings }));
}

function withParameterDelta(
  adapter: Live2DAdapterConfig,
  baseline: Live2DAdapterConfig,
  semantic: Live2DParameterSemantic,
  targetId: string | null
): Live2DAdapterConfig {
  const delta = currentDelta(adapter, baseline) ?? { schemaVersion: 1 as const, sourceEntryPath: baseline.sourceEntryPath, updatedAt: Date.now() };
  const parameterBindings = { ...(delta.parameterBindings ?? {}) };
  if (targetId?.trim()) parameterBindings[semantic] = targetId.trim();
  else delete parameterBindings[semantic];
  return resolveFromDelta(baseline, cleanOverride(baseline, { ...delta, parameterBindings }));
}

export function setSemanticOverride(adapter: Live2DAdapterConfig, baseline: Live2DAdapterConfig, name: string, sourceFile: string): Live2DAdapterConfig {
  const route = baseline.semanticMappings[name] ?? adapter.semanticMappings[name];
  if (!route || !sourceFile.trim()) return clearSemanticOverride(adapter, baseline, name);
  return withSemanticDelta(adapter, baseline, name, {
    sourceFile: sourceFile.trim(),
    supported: true,
    reason: '用户手动覆盖适配器映射。'
  });
}

export function clearSemanticOverride(adapter: Live2DAdapterConfig, baseline: Live2DAdapterConfig, name: string): Live2DAdapterConfig {
  return withSemanticDelta(adapter, baseline, name, null);
}

export function setParameterOverride(adapter: Live2DAdapterConfig, baseline: Live2DAdapterConfig, semantic: Live2DParameterSemantic, targetId: string): Live2DAdapterConfig {
  if (!targetId.trim()) return clearParameterOverride(adapter, baseline, semantic);
  return withParameterDelta(adapter, baseline, semantic, targetId);
}

export function clearParameterOverride(adapter: Live2DAdapterConfig, baseline: Live2DAdapterConfig, semantic: Live2DParameterSemantic): Live2DAdapterConfig {
  return withParameterDelta(adapter, baseline, semantic, null);
}

export function clearAllOverrides(baseline: Live2DAdapterConfig): Live2DAdapterConfig {
  const { overrides: _ignored, ...automatic } = baseline;
  return automatic;
}
