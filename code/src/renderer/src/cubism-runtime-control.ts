import type {
  CubismExpressionCapability,
  CubismMotionCapability,
  CubismRuntimeCapabilities,
  CubismRuntimeFailure,
  CubismRuntimePhase,
  CubismRuntimePriority,
  CubismRuntimeResult,
  CubismRuntimeStatus,
  CubismRuntimeSuccess
} from '../../shared/cubism';

type RuntimeDefinition = Record<string, unknown>;

interface RuntimeExpressionManager {
  definitions?: unknown[];
  resetExpression?: () => void;
  restoreExpression?: () => void;
}

interface RuntimeMotionManager {
  expressionManager?: RuntimeExpressionManager;
  definitions?: Record<string, unknown[]>;
  groups?: Record<string, string>;
  stopAllMotions?: () => void;
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
}

interface RuntimeModelSettings {
  expressions?: unknown[];
  motions?: Record<string, unknown[]>;
}

export interface CubismRuntimeConsumerModel {
  modelIdentity?: string | null;
  expression: (id: string) => Promise<boolean>;
  motion: (group: string, index: number, priority: number) => Promise<boolean>;
  internalModel?: {
    motionManager?: RuntimeMotionManager;
    settings?: RuntimeModelSettings;
  };
}

const PRIORITY_VALUES: Record<CubismRuntimePriority, number> = {
  idle: 1,
  normal: 2,
  force: 3
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function basename(value: string): string {
  return value.replace(/\\/g, '/').split('/').at(-1) ?? value;
}

function definitionFile(definition: RuntimeDefinition): string {
  return stringValue(definition.File)
    ?? stringValue(definition.file)
    ?? stringValue(definition.fileName)
    ?? '';
}

function definitionName(definition: RuntimeDefinition, fallback: string): string {
  return stringValue(definition.Name)
    ?? stringValue(definition.name)
    ?? fallback;
}

function isDefinition(value: unknown): value is RuntimeDefinition {
  if (!value || typeof value !== 'object') return false;
  const definition = value as RuntimeDefinition;
  return Boolean(definitionFile(definition) || stringValue(definition.Name) || stringValue(definition.name));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLocaleLowerCase();
}

function definitionKeys(definition: RuntimeDefinition, fallback: string): string[] {
  const fileName = definitionFile(definition);
  const name = definitionName(definition, fallback);
  const keys = [`name:${name.toLocaleLowerCase()}`];
  if (fileName) {
    keys.push(`file:${normalizePath(fileName)}`);
    keys.push(`base:${basename(fileName).toLocaleLowerCase()}`);
  }
  return keys;
}

function mergeExpressionDefinitions(
  managerDefinitions: unknown[] | undefined,
  settingsDefinitions: unknown[] | undefined
): RuntimeDefinition[] {
  const manager = (Array.isArray(managerDefinitions) ? managerDefinitions : []).filter(isDefinition);
  const settings = (Array.isArray(settingsDefinitions) ? settingsDefinitions : []).filter(isDefinition);
  const merged: RuntimeDefinition[] = [];
  const seen = new Set<string>();
  for (const definition of [...manager, ...settings]) {
    const fallback = definitionFile(definition) ? basename(definitionFile(definition)).replace(/\.exp3\.json$/i, '') : `expression-${merged.length}`;
    const keys = definitionKeys(definition, fallback);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    merged.push(definition);
  }
  return merged;
}

interface RuntimeMotionDefinition {
  group: string;
  index: number;
  definition: RuntimeDefinition;
}

function flattenMotionDefinitions(value: Record<string, unknown[]> | undefined): RuntimeMotionDefinition[] {
  if (!value || typeof value !== 'object') return [];
  const flattened: RuntimeMotionDefinition[] = [];
  for (const [group, definitions] of Object.entries(value)) {
    if (!Array.isArray(definitions)) continue;
    definitions.forEach((definition, index) => {
      if (isDefinition(definition)) flattened.push({ group, index, definition });
    });
  }
  return flattened;
}

function mergeMotionDefinitions(
  managerDefinitions: Record<string, unknown[]> | undefined,
  settingsDefinitions: Record<string, unknown[]> | undefined
): RuntimeMotionDefinition[] {
  const manager = flattenMotionDefinitions(managerDefinitions);
  const settings = flattenMotionDefinitions(settingsDefinitions);
  const merged: RuntimeMotionDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of [...manager, ...settings]) {
    const fallback = definitionFile(entry.definition)
      ? basename(definitionFile(entry.definition)).replace(/\.motion3\.json$/i, '')
      : `${entry.group}[${entry.index}]`;
    const keys = [
      `position:${entry.group.toLocaleLowerCase()}:${entry.index}`,
      ...definitionKeys(entry.definition, fallback)
    ];
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    merged.push(entry);
  }
  return merged;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CubismRuntimeControl {
  private model: CubismRuntimeConsumerModel | null = null;
  private modelIdentity: string | null = null;
  private activeExpression: string | null = null;
  private activeMotion: CubismRuntimeStatus['activeMotion'] = null;
  private motionFinishListener: (() => void) | null = null;

  bind(model: CubismRuntimeConsumerModel, modelIdentity = model.modelIdentity ?? null): void {
    this.unbind();
    this.model = model;
    this.modelIdentity = modelIdentity;
    const motionManager = model.internalModel?.motionManager;
    this.motionFinishListener = () => {
      this.activeMotion = null;
    };
    motionManager?.on?.('motionFinish', this.motionFinishListener);
  }

  dispose(): void {
    this.unbind();
  }

  private unbind(): void {
    if (this.model && this.motionFinishListener) {
      this.model.internalModel?.motionManager?.off?.('motionFinish', this.motionFinishListener);
    }
    this.model = null;
    this.modelIdentity = null;
    this.activeExpression = null;
    this.activeMotion = null;
    this.motionFinishListener = null;
  }

  getStatus(): CubismRuntimeStatus {
    return {
      modelIdentity: this.modelIdentity,
      activeExpression: this.activeExpression,
      activeMotion: this.activeMotion ? { ...this.activeMotion } : null
    };
  }

  getRuntimeStatus(): CubismRuntimeStatus {
    return this.getStatus();
  }

  getCapabilities(): CubismRuntimeCapabilities {
    const motionManager = this.model?.internalModel?.motionManager;
    const settings = this.model?.internalModel?.settings;
    const expressionDefinitions = mergeExpressionDefinitions(
      motionManager?.expressionManager?.definitions,
      settings?.expressions
    );
    const expressions: CubismExpressionCapability[] = expressionDefinitions
      .map((definition, index) => {
        const fileName = definitionFile(definition);
        const fallback = fileName ? basename(fileName).replace(/\.exp3\.json$/i, '') : 'expression-' + index;
        const id = definitionName(definition, fallback);
        return { id, displayName: id, index, fileName };
      });
    const motionDefinitions = mergeMotionDefinitions(motionManager?.definitions, settings?.motions);
    const motions: CubismMotionCapability[] = [];
    for (const entry of motionDefinitions) {
      const fileName = definitionFile(entry.definition);
      const fallback = fileName ? basename(fileName).replace(/\.motion3\.json$/i, '') : entry.group + '[' + entry.index + ']';
      motions.push({
        group: entry.group,
        index: entry.index,
        displayName: definitionName(entry.definition, fallback),
        fileName
      });
    }
    const configuredIdleGroup = stringValue(motionManager?.groups?.idle);
    const idleGroup = configuredIdleGroup && motions.some((motion) => motion.group === configuredIdleGroup)
      ? configuredIdleGroup
      : null;
    return { modelIdentity: this.modelIdentity, expressions, motions, idleGroup };
  }

  findExpressionByFile(fileName: string): CubismExpressionCapability | null {
    const target = basename(fileName).toLocaleLowerCase();
    return this.getCapabilities().expressions.find((item) => basename(item.fileName).toLocaleLowerCase() === target) ?? null;
  }

  findMotionByFile(fileName: string): CubismMotionCapability | null {
    const target = basename(fileName).toLocaleLowerCase();
    return this.getCapabilities().motions.find((item) => basename(item.fileName).toLocaleLowerCase() === target) ?? null;
  }

  private success(phase: CubismRuntimePhase, message: string): CubismRuntimeSuccess {
    return { ok: true, phase, message, status: this.getStatus(), capabilities: this.getCapabilities() };
  }

  private failure(phase: CubismRuntimePhase, code: CubismRuntimeFailure['code'], message: string): CubismRuntimeFailure {
    return { ok: false, phase, code, message, status: this.getStatus(), capabilities: this.getCapabilities() };
  }

  async playExpression(expressionId: string | null): Promise<CubismRuntimeResult> {
    if (!this.model) return this.failure('expression', 'not_ready', 'Cubism 模型尚未初始化。');
    if (!expressionId) return this.failure('expression', 'unsupported', '当前模型没有可用的表情 ID。');
    const capability = this.getCapabilities().expressions.find((item) => item.id === expressionId);
    if (!capability) return this.failure('expression', 'unsupported', '当前模型不包含表情 ID：' + expressionId);
    try {
      const accepted = await this.model.expression(expressionId);
      if (!accepted) return this.failure('expression', 'rejected', 'Pixi/Cubism runtime 拒绝播放表情：' + expressionId + (capability.fileName ? '（文件：' + capability.fileName + '）' : ''));
      this.activeExpression = expressionId;
      return this.success('expression', '已调用当前模型表情：' + expressionId);
    } catch (error) {
      return this.failure('expression', 'runtime_error', '表情文件 ' + (capability.fileName || expressionId) + ' 在 expression 阶段调用失败：' + errorMessage(error));
    }
  }

  async playMotion(group: string, index: number, priority: CubismRuntimePriority): Promise<CubismRuntimeResult> {
    if (!this.model) return this.failure('motion', 'not_ready', 'Cubism 模型尚未初始化。');
    const capability = this.getCapabilities().motions.find((item) => item.group === group && item.index === index);
    if (!capability) return this.failure('motion', 'unsupported', '当前模型不包含动作：' + group + '[' + index + ']');
    const currentPriority = this.activeMotion ? PRIORITY_VALUES[this.activeMotion.priority] : 0;
    const requestedPriority = PRIORITY_VALUES[priority];
    if (currentPriority > 0 && priority !== 'force' && requestedPriority <= currentPriority) {
      return this.failure('motion', 'priority_blocked', '动作被当前 ' + this.activeMotion?.priority + ' 优先级动作占用。');
    }
    try {
      const accepted = await this.model.motion(group, index, requestedPriority);
      if (!accepted) return this.failure('motion', 'rejected', 'Pixi/Cubism runtime 拒绝播放动作：' + group + '[' + index + ']' + (capability.fileName ? '（文件：' + capability.fileName + '）' : ''));
      this.activeMotion = { group, index, priority };
      return this.success('motion', '已调用当前模型动作：' + group + '[' + index + ']');
    } catch (error) {
      return this.failure('motion', 'runtime_error', '动作文件 ' + (capability.fileName || group + '[' + index + ']') + ' 在 motion 阶段调用失败：' + errorMessage(error));
    }
  }

  stopExpression(): CubismRuntimeResult {
    if (!this.model) return this.failure('stop_expression', 'not_ready', 'Cubism 模型尚未初始化。');
    this.model.internalModel?.motionManager?.expressionManager?.resetExpression?.();
    this.activeExpression = null;
    return this.success('stop_expression', '已请求当前模型恢复默认表情。');
  }

  stopMotion(): CubismRuntimeResult {
    if (!this.model) return this.failure('stop_motion', 'not_ready', 'Cubism 模型尚未初始化。');
    const motionManager = this.model.internalModel?.motionManager;
    motionManager?.stopAllMotions?.();
    motionManager?.expressionManager?.restoreExpression?.();
    this.activeMotion = null;
    return this.success('stop_motion', '已停止当前模型动作并恢复表情链。');
  }

  reset(): CubismRuntimeResult {
    if (!this.model) return this.failure('reset', 'not_ready', 'Cubism 模型尚未初始化。');
    this.model.internalModel?.motionManager?.stopAllMotions?.();
    this.model.internalModel?.motionManager?.expressionManager?.resetExpression?.();
    this.activeExpression = null;
    this.activeMotion = null;
    return this.success('reset', '已停止动作、恢复默认表情并清空运行状态。');
  }
}
