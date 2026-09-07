import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import type { CursorUpdate, PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentMode, AgentTask } from '../../shared/agent';
import type { PresentationEvent } from '../../shared/presentation';
import type { SessionMessage } from '../../shared/session';
import { modelViewportForPath, normalizeModelViewportKey, sanitizeModelViewport, type ModelViewportSettings } from '../../shared/settings';
import { AGENT_TASK_STATUS_LABELS, isActiveAgentTaskStatus } from './agent-ui-model';
import { CompanionChat } from './CompanionChat';
import { Live2DCanvas } from './Live2DCanvas';
import { WorkbenchIcon } from './WorkbenchIcon';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';
import {
  WORKBENCH_LAYOUT_LIMITS,
  defaultWorkbenchLayoutState,
  maxCharacterPanelWidth,
  readWorkbenchLayoutState,
  writeWorkbenchLayoutPatch
} from './workbench-layout';

const staticRoleImage = new URL('./assets/baoyin-static-role.png', import.meta.url).href;

export type Live2DStageStatus = 'empty' | 'loading' | 'ready' | 'error';

function live2dStageStatus(model: PublicAppState['live2d']): Live2DStageStatus {
  if (model.status === 'ready' || model.status === 'ready_with_warnings') return 'ready';
  if (model.status === 'missing' || model.status === 'invalid' || model.status === 'unreadable') return 'error';
  return model.entryPath ? 'loading' : 'empty';
}

function StaticRole({ roleName }: { roleName: string }): JSX.Element {
  return <section className="wb-static-role is-character-placeholder" data-workbench-role="static" aria-label={`${roleName}静态角色预览`}>
    <img className="wb-static-role-base" src={staticRoleImage} alt={`${roleName}静态角色`} draggable={false} />
    <img className="wb-static-role-highlight" src={staticRoleImage} alt="" aria-hidden="true" draggable={false} />
  </section>;
}

interface Live2DStageProps {
  status: Live2DStageStatus;
  roleName: string;
  liveContent?: ReactNode;
  fallback: ReactNode;
}

export function Live2DStage({ status, roleName, liveContent, fallback }: Live2DStageProps): JSX.Element {
  const isLive = status === 'ready';
  return <div className={`wb-character-art ${isLive ? 'is-live2d' : 'is-static-role'} is-stage-${status}`} data-agent-domain="presentation" data-workbench-live2d="shared" data-workbench-stage="live2d" data-live2d-stage-status={status} aria-busy={status === 'loading'} aria-label={`${roleName}角色舞台`}>
    <span className="wb-stage-stars" data-stage-layer="stars" aria-hidden="true" />
    <span className={`wb-stage-halo ${isLive ? 'is-active' : ''}`} data-stage-layer="halo" aria-hidden="true" />
    <div className="wb-stage-role wb-stage-role-placeholder" data-stage-layer="role" data-stage-role="placeholder" aria-hidden={isLive}>{fallback}</div>
    <div className="wb-stage-role wb-stage-role-live" data-stage-layer="live2d" data-stage-role="live2d" aria-hidden={!isLive}>{liveContent}</div>
    <span className="wb-stage-glow" data-stage-layer="glow" aria-hidden="true" />
    {status === 'error' ? <span className="wb-stage-status" role="status">模型加载失败 · 请在设置中重试</span> : null}
  </div>;
}

const neutralEvent: PresentationEvent = { type: 'expression', name: 'neutral', source: 'system' };
const neutralDialogueEvent: Extract<PresentationEvent, { type: 'dialogue' }> = { type: 'dialogue', phase: 'end', source: 'system' };

interface AgentConsoleProps {
  state: PublicAppState;
  agentTasks: readonly AgentTask[];
  agentEvent: AgentEvent | null;
  onModeChange: (mode: AgentMode) => void;
  onNewConversation?: () => void;
  onMessageSent?: (message: string) => void;
  onShowPet?: () => void;
  characterVisible?: boolean;
  contextUsageOverride?: number;
  referenceFixture?: boolean;
  initialMessages?: readonly SessionMessage[];
  sessionId?: string;
  workspaceAvailable?: boolean;
}

const referenceTrajectory = [
  { id: 'reference-route', summary: '规则判断 · 需要工作链路', completed: false },
  { id: 'reference-classify', summary: '轻量分类 · 项目分析', completed: false },
  { id: 'reference-context', summary: '上下文注入 · 项目设置', completed: false },
  { id: 'reference-tool', summary: '工具执行 · 检索文件结构　已完成', completed: true }
] as const;

function elapsedLabel(task: AgentTask | null): string {
  if (!task) return '未开始';
  const seconds = Math.max(0, Math.round((task.updatedAt - task.createdAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function stepLabel(task: AgentTask): string {
  return `${AGENT_TASK_STATUS_LABELS[task.status].label} · ${task.message}`;
}

interface CharacterDragState {
  pointerId: number;
  startX: number;
  startY: number;
  baseViewport: ModelViewportSettings;
  moved: boolean;
}

export function AgentConsole({ state, agentTasks, agentEvent, onModeChange, onNewConversation, onMessageSent, onShowPet = () => undefined, characterVisible = true, contextUsageOverride, referenceFixture = false, initialMessages = [], sessionId = '', workspaceAvailable = true }: AgentConsoleProps): JSX.Element {
  const referenceScale = referenceFixture ? Math.min(window.innerWidth / 1622, window.innerHeight / 969) : 1;
  const referenceCharacterWidth = 332.265625 * referenceScale;
  const characterResetWidth = referenceFixture ? referenceCharacterWidth : defaultWorkbenchLayoutState({ width: window.innerWidth, height: window.innerHeight }).characterWidth;
  const [presentation, setPresentation] = useState<PresentationEvent>(neutralEvent);
  const [dialogueEvent, setDialogueEvent] = useState<Extract<PresentationEvent, { type: 'dialogue' }>>(neutralDialogueEvent);
  const [characterWidth, setCharacterWidth] = useState(() => referenceFixture ? referenceCharacterWidth : readWorkbenchLayoutState().characterWidth);
  const [workflowWidth, setWorkflowWidth] = useState(1200);
  const [characterModelViewport, setCharacterModelViewport] = useState<ModelViewportSettings>(() => modelViewportForPath(state.settings, state.live2d.entryPath));
  const [characterDragActive, setCharacterDragActive] = useState(false);
  const [cursor, setCursor] = useState<CursorUpdate | null>(null);
  const workflowRef = useRef<HTMLDivElement>(null);
  const characterViewportRef = useRef<ModelViewportSettings>(characterModelViewport);
  const characterDragRef = useRef<CharacterDragState | null>(null);
  const latestTask = agentTasks.find((task) => task.roleId === state.role.id) ?? null;
  const activeTask = latestTask && isActiveAgentTaskStatus(latestTask.status) ? latestTask : null;
  const trajectory = activeTask?.steps.slice(-5) ?? [];
  const stageStatus = live2dStageStatus(state.live2d);
  const modelReady = stageStatus === 'ready';

  useEffect(() => {
    const unsubscribe = window.starchat.presentation.onEvent((event) => {
      setPresentation(event);
      if (event.type === 'dialogue') setDialogueEvent(event);
    });
    const unsubscribeCursor = window.starchat.cursor.onUpdate(setCursor);
    return () => {
      unsubscribe();
      unsubscribeCursor();
    };
  }, []);

  useEffect(() => {
    const workflow = workflowRef.current;
    if (!workflow) return;
    const measure = (): void => setWorkflowWidth(Math.round(workflow.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(workflow);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const next = modelViewportForPath(state.settings, state.live2d.entryPath);
    characterViewportRef.current = next;
    setCharacterModelViewport(next);
  }, [state.live2d.entryPath, state.settings.modelViewportByModel]);

  const maximumCharacterWidth = maxCharacterPanelWidth(workflowWidth);
  const effectiveCharacterWidth = Math.min(characterWidth, maximumCharacterWidth);
  const resizeCharacter = (value: number): void => {
    setCharacterWidth(value);
    if (!referenceFixture) writeWorkbenchLayoutPatch({ characterWidth: value });
  };
  const updateCharacterModelViewport = (next: Partial<ModelViewportSettings>): ModelViewportSettings => {
    const updated = sanitizeModelViewport({ ...characterViewportRef.current, ...next });
    characterViewportRef.current = updated;
    setCharacterModelViewport(updated);
    return updated;
  };
  const persistCharacterModelViewport = (next: ModelViewportSettings): void => {
    const key = normalizeModelViewportKey(state.live2d.entryPath);
    if (!key) return;
    void window.starchat.settings.save({
      settings: {
        modelViewportByModel: {
          ...state.settings.modelViewportByModel,
          [key]: next
        }
      }
    });
  };
  const isCharacterControlTarget = (target: EventTarget | null): boolean => {
    return target instanceof HTMLElement && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
  };
  const startCharacterDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || isCharacterControlTarget(event.target)) return;
    characterDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseViewport: characterViewportRef.current,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setCharacterDragActive(true);
    event.preventDefault();
  };
  const moveCharacterDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = characterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 2) return;
    drag.moved = true;
    updateCharacterModelViewport({
      modelOffsetX: drag.baseViewport.modelOffsetX + deltaX,
      modelOffsetY: drag.baseViewport.modelOffsetY + deltaY
    });
    event.preventDefault();
  };
  const finishCharacterDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = characterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) persistCharacterModelViewport(characterViewportRef.current);
    characterDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setCharacterDragActive(false);
  };
  const zoomCharacter = (event: ReactWheelEvent<HTMLElement>): void => {
    if (isCharacterControlTarget(event.target)) return;
    const factor = event.deltaY < 0 ? 1.08 : 0.925;
    const next = updateCharacterModelViewport({ modelScale: characterViewportRef.current.modelScale * factor });
    persistCharacterModelViewport(next);
    event.preventDefault();
  };
  const handleCharacterKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (isCharacterControlTarget(event.target)) return;
    const step = event.shiftKey ? 24 : 8;
    const offset = event.key === 'ArrowLeft' ? { modelOffsetX: characterViewportRef.current.modelOffsetX - step }
      : event.key === 'ArrowRight' ? { modelOffsetX: characterViewportRef.current.modelOffsetX + step }
        : event.key === 'ArrowUp' ? { modelOffsetY: characterViewportRef.current.modelOffsetY - step }
          : event.key === 'ArrowDown' ? { modelOffsetY: characterViewportRef.current.modelOffsetY + step }
            : event.key === '+' || event.key === '=' ? { modelScale: characterViewportRef.current.modelScale * 1.08 }
              : event.key === '-' ? { modelScale: characterViewportRef.current.modelScale * 0.925 }
                : null;
    if (!offset) return;
    const next = updateCharacterModelViewport(offset);
    persistCharacterModelViewport(next);
    event.preventDefault();
  };
  const trajectoryResponse = referenceFixture ? '我已分析该项目的设置结构，主要分为全局设置、开发设置、构建设置、测试设置和部署设置五大类。' : latestTask ? stepLabel(latestTask) : '';
  const workflowStyle = { '--wb-reference-scale': `${referenceScale}`, '--wb-character-width': `${effectiveCharacterWidth}px` } as CSSProperties;

  return <section className="wb-agent-console" data-agent-domain="execution" data-agent-ui="console" aria-label="Agent 工作流">
    <div ref={workflowRef} className="wb-agent-workflow" style={workflowStyle} data-agent-ui="workflow" data-character-width={effectiveCharacterWidth} data-character-visible={characterVisible ? 'true' : 'false'}>
      {characterVisible ? <aside className="wb-character-panel" data-workbench-region="character" data-character-interaction="model-transform" data-character-dragging={characterDragActive ? 'true' : 'false'} tabIndex={0} aria-label={`${state.role.displayName}角色画面`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + -" onPointerDown={startCharacterDrag} onPointerMove={moveCharacterDrag} onPointerUp={finishCharacterDrag} onPointerCancel={finishCharacterDrag} onLostPointerCapture={finishCharacterDrag} onWheel={zoomCharacter} onKeyDown={handleCharacterKeyDown}>
        <div className="wb-character-actions"><button type="button" className="wb-character-action" data-workbench="pet-action" onClick={onShowPet}><WorkbenchIcon name="pet" size={15} />弹出为桌宠</button></div>
        <Live2DStage
          status={stageStatus}
          roleName={state.role.displayName}
          fallback={<StaticRole roleName={state.role.displayName} />}
          liveContent={modelReady ? <Live2DCanvas
            event={presentation}
            dialogueEvent={dialogueEvent}
            live2d={state.live2d}
            modelViewport={characterModelViewport}
            cursor={cursor}
            gazeConfig={{
              enabled: state.settings.cursorTrackingEnabled,
              eyeWeight: state.settings.cursorEyeWeight,
              headWeight: state.settings.cursorHeadWeight,
              bodyWeight: state.settings.cursorBodyWeight,
              smoothing: state.settings.cursorSmoothing,
              maxStep: state.settings.cursorMaxStep,
              rangeX: state.settings.cursorRangeX,
              rangeY: state.settings.cursorRangeY,
              idleMotionAmplitude: state.settings.cursorIdleMotion,
              bodyFollowStrength: state.settings.presentation.bodyFollowStrength,
              bodyLag: state.settings.presentation.bodyLag,
              inertiaStrength: state.settings.presentation.inertiaStrength,
              idleSwayStrength: state.settings.presentation.idleSwayStrength,
              physicsEnabled: state.settings.presentation.physicsEnabled
            }}
            showWatermark={state.settings.live2dShowWatermark}
          /> : null}
        />
      </aside> : null}
      {characterVisible ? <div className="wb-character-resizer" data-workbench-resizer="character"><WorkbenchResizeHandle axis="vertical" value={effectiveCharacterWidth} minimum={WORKBENCH_LAYOUT_LIMITS.character.minimum} maximum={maximumCharacterWidth} resetValue={characterResetWidth} label="调整人物区域宽度" controls="workbench-dialogue-column" onChange={resizeCharacter} /></div> : null}
      <div id="workbench-dialogue-column" className="wb-dialogue-column" data-workbench-region="dialogue">
        {referenceFixture || activeTask ? <div className="wb-dialogue-meta"><span>{referenceFixture ? '用时' : '任务用时'}　<strong>{referenceFixture ? '6分45秒' : elapsedLabel(activeTask)}</strong>　<WorkbenchIcon name="chevron" size={13} /></span></div> : null}
        {referenceFixture || activeTask ? <div className={`wb-trajectory ${referenceFixture ? 'is-reference-fixture' : ''}`} data-agent-ui="plan">
          <div className="wb-trajectory-steps">
            {referenceFixture ? referenceTrajectory.map((step) => <span key={step.id}><WorkbenchIcon name={step.completed ? 'agentDone' : 'agentStep'} size={20} />{step.summary}</span>) : trajectory.length > 0 ? trajectory.map((step) => <span key={step.id}><WorkbenchIcon name={step.status === 'completed' ? 'check' : 'step'} size={15} />{step.summary}</span>) : <span><WorkbenchIcon name="step" size={15} />发送消息后显示实时任务步骤</span>}
          </div>
          <div className="wb-trajectory-response">
             <p>{trajectoryResponse}</p>
            {referenceFixture ? <div className="wb-plan-actions" aria-label="轨迹操作"><span className="wb-plan-action"><WorkbenchIcon name="copy" size={17} /></span><span className="wb-plan-action"><WorkbenchIcon name="thumbsUp" size={17} /></span><span className="wb-plan-action"><WorkbenchIcon name="thumbsDown" size={17} /></span><span className="wb-plan-action"><WorkbenchIcon name="refresh" size={17} /></span></div> : <div className="wb-plan-actions" aria-label="轨迹状态"><span>{agentEvent ? `最近事件：${agentEvent.type}` : '等待任务事件'}</span></div>}
          </div>
        </div> : null}
        <CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} onNewConversation={onNewConversation} onMessageSent={onMessageSent} showRouteControl={false} compact={!referenceFixture} showStatusSummary={false} contextUsageOverride={contextUsageOverride} referenceFixture={referenceFixture} initialMessages={initialMessages} sessionId={sessionId} workspaceAvailable={workspaceAvailable} />
      </div>
    </div>
  </section>;
}
