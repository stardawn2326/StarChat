import type {
  Live2DAdapterConfig,
  Live2DModelState,
  Live2DSemanticRoute
} from '../../shared/live2d';
import { resolveLive2DSemantic } from '../../shared/live2d';

function basename(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').at(-1) ?? fileName;
}

function sameAsset(left: string, right: string): boolean {
  return basename(left).toLocaleLowerCase() === basename(right).toLocaleLowerCase();
}

export interface ExpressionMotionAdapterAssets {
  expressions?: readonly string[];
  motions?: readonly string[];
}

export interface ExpressionMotionState {
  expression: string | null;
  action: string | null;
  watermark: 'on' | 'off';
}

/**
 * Application-layer semantic routing only.
 *
 * This class intentionally does not touch Cubism parameters, motion-manager
 * update hooks, focus state, physics, or a product ticker. It resolves the
 * already parsed external assets; pixi-live2d-display owns all model updates.
 */
export class ExpressionMotionAdapter {
  private expression: { name: string; route: Live2DSemanticRoute } | null = null;
  private action: { name: string; route: Live2DSemanticRoute } | null = null;
  private watermark: 'on' | 'off' = 'on';
  private readonly adapter: Live2DAdapterConfig | null;
  private readonly availableExpressions: Set<string> | null;
  private readonly availableMotions: Set<string> | null;

  constructor(adapter: Live2DAdapterConfig | null, assets: ExpressionMotionAdapterAssets = {}) {
    this.adapter = adapter;
    this.availableExpressions = assets.expressions ? new Set(assets.expressions) : null;
    this.availableMotions = assets.motions ? new Set(assets.motions) : null;
  }

  private routeFor(name: string, category: 'expression' | 'action' | 'system'): Live2DSemanticRoute | null {
    if (!this.adapter) {
      return null;
    }
    const resolved = resolveLive2DSemantic(this.adapter, name);
    const route = this.adapter.semanticMappings[resolved.resolved];
    if (!route || (route.category !== category && !(category === 'expression' && route.category === 'system'))) {
      return null;
    }
    if (!route.sourceFile) {
      return route;
    }
    const available = category === 'action' ? this.availableMotions : this.availableExpressions;
    if (available && !Array.from(available).some((asset) => sameAsset(asset, route.sourceFile!))) {
      return {
        ...route,
        supported: false,
        sourceFile: null,
        reason: `语义资源未出现在当前 Live2DModel 定义中：${route.sourceFile}`
      };
    }
    return route;
  }

  setExpression(name: string | null): Live2DSemanticRoute | null {
    if (!name) {
      this.expression = null;
      return null;
    }
    const route = this.routeFor(name, 'expression');
    this.expression = route?.sourceFile ? { name, route } : null;
    return route;
  }

  clearExpression(): void {
    this.expression = null;
  }

  setAction(name: string | null): Live2DSemanticRoute | null {
    if (!name) {
      this.action = null;
      return null;
    }
    const route = this.routeFor(name, 'action');
    this.action = route?.sourceFile ? { name, route } : null;
    return route;
  }

  clearAction(): void {
    this.action = null;
  }

  setWatermark(enabled: boolean): Live2DSemanticRoute | null {
    this.watermark = enabled ? 'on' : 'off';
    return this.routeFor(enabled ? 'watermark_on' : 'watermark_off', 'expression');
  }

  getRoute(name: string, category: 'expression' | 'action' | 'system' = 'expression'): Live2DSemanticRoute | null {
    return this.routeFor(name, category);
  }

  getExpressionRoute(): Live2DSemanticRoute | null {
    return this.expression?.route ?? null;
  }

  getActionRoute(): Live2DSemanticRoute | null {
    return this.action?.route ?? null;
  }

  getState(): ExpressionMotionState {
    return {
      expression: this.expression?.name ?? null,
      action: this.action?.name ?? null,
      watermark: this.watermark
    };
  }

  getAvailableAssets(): { expressions: readonly string[]; motions: readonly string[] } {
    return {
      expressions: this.availableExpressions ? [...this.availableExpressions] : [],
      motions: this.availableMotions ? [...this.availableMotions] : []
    };
  }

  static fromModelState(
    adapter: Live2DAdapterConfig | null,
    state: Pick<Live2DModelState, 'expressions' | 'motions'>
  ): ExpressionMotionAdapter {
    return new ExpressionMotionAdapter(adapter, {
      expressions: state.expressions.map((asset) => asset.fileName),
      motions: state.motions.map((asset) => asset.fileName)
    });
  }
}
