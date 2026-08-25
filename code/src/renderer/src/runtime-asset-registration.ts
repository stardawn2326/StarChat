interface RuntimeAsset {
  fileName: string;
  parseStatus?: string;
}

interface RuntimeSettings {
  expressions?: Array<Record<string, unknown>>;
  motions?: Record<string, Array<Record<string, unknown>>>;
}

interface RuntimeExpressionManager {
  definitions?: Array<Record<string, unknown>>;
  expressions?: unknown[];
}

interface RuntimeMotionManager {
  definitions?: Record<string, Array<Record<string, unknown>>>;
  motionGroups?: Record<string, unknown[]>;
  expressionManager?: RuntimeExpressionManager;
}

interface RuntimeInternalModel {
  settings?: RuntimeSettings;
  motionManager?: RuntimeMotionManager;
}

interface RuntimeAssets {
  expressions?: RuntimeAsset[];
  motions?: RuntimeAsset[];
}

function normalized(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLocaleLowerCase();
}

function assetName(fileName: string, suffix: RegExp): string {
  return fileName.replace(/\\/g, '/').split('/').at(-1)?.replace(suffix, '') || fileName;
}

function validAssets(assets: RuntimeAsset[] | undefined, suffix: RegExp): RuntimeAsset[] {
  return (assets ?? []).filter((asset) => asset.parseStatus !== 'error' && suffix.test(asset.fileName));
}

export function registerRuntimeAssets(
  internalModel: RuntimeInternalModel,
  assets: RuntimeAssets
): { expressionsAdded: number; motionsAdded: number; needsExpressionManager: boolean } {
  const settings = internalModel.settings;
  const motionManager = internalModel.motionManager;
  if (!settings || !motionManager) {
    return { expressionsAdded: 0, motionsAdded: 0, needsExpressionManager: false };
  }

  const expressions = [...(settings.expressions ?? [])];
  const expressionFiles = new Set(expressions.map((item) => normalized(String(item.File ?? ''))));
  let expressionsAdded = 0;
  for (const asset of validAssets(assets.expressions, /\.exp3\.json$/i)) {
    if (expressionFiles.has(normalized(asset.fileName))) continue;
    expressions.push({ Name: assetName(asset.fileName, /\.exp3\.json$/i), File: asset.fileName });
    expressionFiles.add(normalized(asset.fileName));
    expressionsAdded += 1;
  }
  settings.expressions = expressions;
  if (motionManager.expressionManager) {
    motionManager.expressionManager.definitions = expressions;
    motionManager.expressionManager.expressions ??= [];
  }

  const motions = Object.fromEntries(
    Object.entries(settings.motions ?? {}).map(([group, definitions]) => [group, [...definitions]])
  );
  const motionFiles = new Set(
    Object.values(motions).flat().map((item) => normalized(String(item.File ?? '')))
  );
  let motionsAdded = 0;
  for (const asset of validAssets(assets.motions, /\.motion3\.json$/i)) {
    if (motionFiles.has(normalized(asset.fileName))) continue;
    (motions.Imported ??= []).push({ File: asset.fileName });
    motionFiles.add(normalized(asset.fileName));
    motionsAdded += 1;
  }
  settings.motions = motions;
  motionManager.definitions = motions;
  motionManager.motionGroups ??= {};
  for (const group of Object.keys(motions)) {
    motionManager.motionGroups[group] ??= [];
  }

  return {
    expressionsAdded,
    motionsAdded,
    needsExpressionManager: expressions.length > 0 && !motionManager.expressionManager
  };
}
