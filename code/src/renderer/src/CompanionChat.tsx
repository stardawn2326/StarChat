import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PublicAppState } from '../../shared/ipc';
import type { ExpressionName, RoleSemanticMapping } from '../../shared/role-package';
import type { AppSettings } from '../../shared/settings';
import { presentationForAssistantText } from '../../shared/companion';
import { AGENT_MODE_OPTIONS, type AgentEvent, type AgentMode, type AgentTask } from '../../shared/agent';
import { GlassSelect } from './GlassSelect';
import { AgentTaskPanel } from './AgentTaskPanel';
import type { SessionMessage } from '../../shared/session';
import { AGENT_TASK_STATUS_LABELS, currentAgentStep, estimateContextUsage, isActiveAgentTaskStatus } from './agent-ui-model';
import { WorkbenchIcon } from './WorkbenchIcon';
import { BrowserSpeechRecognitionProvider } from './stt-provider';
import { BasicVad } from './vad';
import {
  EmotionCueGate,
  LipSyncEnvelope,
  PhraseCueScheduler,
  StreamingSentenceBuffer,
  splitRealtimePresentation,
  mouthFormAtProgress,
  timeDomainRms
} from './speech-performance';

interface CompanionChatProps {
  state: PublicAppState;
  agentTasks: readonly AgentTask[];
  agentEvent: AgentEvent | null;
  onModeChange?: (mode: AgentMode) => void;
  onNewConversation?: () => void;
  onMessageSent?: (message: string) => void;
  onRequestWorkspace?: () => void;
  showRouteControl?: boolean;
  compact?: boolean;
  showStatusSummary?: boolean;
  contextUsageOverride?: number;
  referenceFixture?: boolean;
  initialMessages?: readonly SessionMessage[];
  sessionId?: string;
  workspaceAvailable?: boolean;
}

type CancelPlayback = (() => void) | null;

function emitSpeech(speaking: boolean, mouthOpen = 0, mouthForm = 0): void {
  window.starchat.presentation.emit({
    type: 'speech',
    speaking,
    source: 'assistant',
    mouthOpen: Math.min(1, Math.max(0, mouthOpen)),
    mouthForm: Math.min(1, Math.max(-1, mouthForm)),
    timestamp: Date.now()
  });
}

function emitDialogue(phase: 'start' | 'listening' | 'replying' | 'end'): void {
  window.starchat.presentation.emit({
    type: 'dialogue',
    phase,
    source: 'system',
    timestamp: Date.now()
  });
}

function emitNeutralPresentation(): void {
  window.starchat.presentation.emit({
    type: 'control',
    name: 'neutral',
    source: 'system',
    layer: 'safety'
  });
}

function finishDialoguePresentation(): void {
  emitSpeech(false);
  emitNeutralPresentation();
  emitDialogue('end');
}

async function playAnalyzedSpeech(
  text: string,
  source: string,
  settings: AppSettings,
  registerCancel: (cancel: CancelPlayback) => void
): Promise<void> {
  const audio = new Audio(source);
  audio.volume = settings.ttsVolume;
  audio.playbackRate = settings.ttsRate;
  const context = new AudioContext();
  const mediaSource = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0;
  mediaSource.connect(analyser);
  analyser.connect(context.destination);
  const samples = new Uint8Array(analyser.fftSize);
  const envelope = new LipSyncEnvelope();

  await new Promise<void>((resolve, reject) => {
    let animationFrame = 0;
    let timeout = 0;
    let finished = false;
    let lastSampleAt = performance.now();
    let lastEmitAt = Number.NEGATIVE_INFINITY;

    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      audio.pause();
      emitSpeech(false);
      registerCancel(null);
      void context.close();
      if (error) reject(error);
      else resolve();
    };

    const sampleAudio = (now: number): void => {
      if (finished) return;
      const elapsed = Math.max(1, now - lastSampleAt);
      lastSampleAt = now;
      analyser.getByteTimeDomainData(samples);
      const mouthOpen = envelope.update(timeDomainRms(samples), elapsed);
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const progress = duration > 0 ? audio.currentTime / duration : 0;
      const mouthForm = mouthOpen > 0.03 ? mouthFormAtProgress(text, progress) : 0;
      if (now - lastEmitAt >= 33) {
        emitSpeech(true, mouthOpen, mouthForm);
        lastEmitAt = now;
      }
      animationFrame = window.requestAnimationFrame(sampleAudio);
    };

    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('语音音频播放失败'));
    timeout = window.setTimeout(() => finish(new Error('语音音频播放超时')), 45000);
    registerCancel(() => finish());
    void context.resume()
      .then(() => audio.play())
      .then(() => {
        if (finished) return;
        emitSpeech(true, 0, 0);
        animationFrame = window.requestAnimationFrame(sampleAudio);
      })
      .catch((error: unknown) => finish(error instanceof Error ? error : new Error('语音播放失败')));
  });
}

function emitPresentationEvents(
  events: ReturnType<typeof presentationForAssistantText>,
  gate: EmotionCueGate
): void {
  const now = Date.now();
  for (const event of events) {
    if (!('name' in event)) continue;
    if (!gate.accept(event.name, now)) continue;
    window.starchat.presentation.emit(event);
  }
}

function segmentPresentation(
  text: string,
  mappings: Readonly<Record<string, RoleSemanticMapping>>
): ReturnType<typeof splitRealtimePresentation> {
  return splitRealtimePresentation(presentationForAssistantText(text, mappings));
}

export function CompanionChat({ state, agentTasks, agentEvent, onModeChange, onNewConversation: _onNewConversation, onMessageSent, onRequestWorkspace = () => undefined, showRouteControl = true, compact = false, showStatusSummary = true, contextUsageOverride, referenceFixture = false, initialMessages = [], sessionId = '', workspaceAvailable = true }: CompanionChatProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map(({ role, content }) => ({ role, content })));
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentTaskId, setSelectedAgentTaskId] = useState<string | null>(null);
  const [hideHistoricalAgentTask, setHideHistoricalAgentTask] = useState(false);
  const [showEarlierMessages, setShowEarlierMessages] = useState(false);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(!compact);
  const [isListening, setIsListening] = useState(false);
  const activeId = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const assistantText = useRef('');
  const settingsRef = useRef(state.settings);
  const mappingsRef = useRef(state.role.presentation.semanticMappings);
  const sentenceBufferRef = useRef(new StreamingSentenceBuffer());
  const synthesisTailRef = useRef<Promise<void>>(Promise.resolve());
  const playbackTailRef = useRef<Promise<void>>(Promise.resolve());
  const speechGenerationRef = useRef(0);
  const cancelPlaybackRef = useRef<CancelPlayback>(null);
  const emotionFlushTimerRef = useRef<number | null>(null);
  const expressionGateRef = useRef(new EmotionCueGate(1600));
  // Motions are emitted at the audio boundary. De-duplicate identical motion
  // names, but never hold a later sentence's motion behind an emotion hold.
  const actionGateRef = useRef(new EmotionCueGate(0));
  const phraseCueSchedulerRef = useRef(new PhraseCueScheduler({ leadMs: 420, cooldownMs: 650 }));
  const cancelCueLeadRef = useRef<CancelPlayback>(null);
  const replyStartedRef = useRef(false);
  const lastAgentEventRef = useRef<AgentEvent | null>(null);
  const sttProviderRef = useRef<BrowserSpeechRecognitionProvider | null>(null);
  const vadRef = useRef(new BasicVad({ silenceMs: 1400 }));
  const voiceBaseDraftRef = useRef('');
  const voiceInterimRef = useRef('');
  if (!sttProviderRef.current) sttProviderRef.current = new BrowserSpeechRecognitionProvider();
  settingsRef.current = state.settings;
  mappingsRef.current = state.role.presentation.semanticMappings;
  const voiceAvailable = sttProviderRef.current.isAvailable();

  const latestAgentTask = agentTasks.find((task) => task.roleId === state.role.id) ?? null;
  const agentTask = selectedAgentTaskId
    ? agentTasks.find((task) => task.id === selectedAgentTaskId) ?? null
    : hideHistoricalAgentTask ? null : latestAgentTask;
  const compactMessageLimit = 6;
  const hiddenMessageCount = compact && !showEarlierMessages ? Math.max(0, messages.length - compactMessageLimit) : 0;
  const visibleMessages = hiddenMessageCount > 0 ? messages.slice(hiddenMessageCount) : messages;

  const clearEmotionFlushTimer = (): void => {
    if (emotionFlushTimerRef.current === null) return;
    window.clearTimeout(emotionFlushTimerRef.current);
    emotionFlushTimerRef.current = null;
  };

  const flushPendingEmotion = (): void => {
    emotionFlushTimerRef.current = null;
    const expression = expressionGateRef.current.flush(Date.now());
    if (!expression) return;
    window.starchat.presentation.emit({
      type: 'expression',
      name: expression as ExpressionName,
      source: 'assistant',
      layer: 'dialogue_emotion'
    });
    if (expressionGateRef.current.hasPending()) {
      emotionFlushTimerRef.current = window.setTimeout(flushPendingEmotion, 120);
    }
  };

  const schedulePendingEmotion = (): void => {
    if (!expressionGateRef.current.hasPending()) return;
    clearEmotionFlushTimer();
    emotionFlushTimerRef.current = window.setTimeout(flushPendingEmotion, 1700);
  };

  const stopVoiceInput = (): void => {
    sttProviderRef.current?.stop();
    vadRef.current.stop();
    voiceInterimRef.current = '';
    setIsListening(false);
  };

  const toggleVoiceInput = (): void => {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    const provider = sttProviderRef.current;
    if (!provider?.isAvailable()) {
      setError('当前运行环境未提供手动语音识别');
      return;
    }
    voiceBaseDraftRef.current = draft.trim();
    voiceInterimRef.current = '';
    setError(null);
    vadRef.current.start();
    provider.start({
      onText: (text, isFinal) => {
        vadRef.current.markVoice();
        if (isFinal) {
          const base = voiceBaseDraftRef.current;
          const next = [base, text].filter(Boolean).join(base ? ' ' : '');
          voiceBaseDraftRef.current = next;
          voiceInterimRef.current = '';
          setDraft(next);
          return;
        }
        voiceInterimRef.current = text;
        const base = voiceBaseDraftRef.current;
        setDraft([base, voiceInterimRef.current].filter(Boolean).join(base ? ' ' : ''));
      },
      onError: (message) => setError(message),
      onEnd: () => {
        vadRef.current.stop();
        setIsListening(false);
      }
    });
    setIsListening(true);
  };

  const cancelSpeech = (): void => {
    speechGenerationRef.current += 1;
    sentenceBufferRef.current.reset();
    clearEmotionFlushTimer();
    cancelPlaybackRef.current?.();
    cancelPlaybackRef.current = null;
    cancelCueLeadRef.current?.();
    cancelCueLeadRef.current = null;
    synthesisTailRef.current = Promise.resolve();
    playbackTailRef.current = Promise.resolve();
    expressionGateRef.current.reset();
    actionGateRef.current.reset();
    phraseCueSchedulerRef.current.reset();
    replyStartedRef.current = false;
    finishDialoguePresentation();
  };

  const enqueueSpeech = (text: string): void => {
    const segment = text.trim();
    if (!segment) return;
    const generation = speechGenerationRef.current;
    const presentation = segmentPresentation(segment, mappingsRef.current);
    // A completed streamed sentence already contains enough meaning to update
    // the face. Do not wait for online TTS synthesis or the playback queue.
    emitPresentationEvents(presentation.realtime, expressionGateRef.current);
    schedulePendingEmotion();
    const sourcePromise = synthesisTailRef.current.then(() => {
      if (generation !== speechGenerationRef.current) return '';
      return window.starchat.tts.synthesize(segment);
    });
    synthesisTailRef.current = sourcePromise.then(() => undefined, () => undefined);
    const playback = playbackTailRef.current.then(async () => {
      const source = await sourcePromise;
      if (!source || generation !== speechGenerationRef.current) return;
      const registerCancel = (cancel: CancelPlayback): void => {
        if (generation === speechGenerationRef.current) cancelPlaybackRef.current = cancel;
      };
      const actionEvent = presentation.playback.find((event) => event.type === 'action');
      const cue = phraseCueSchedulerRef.current.enqueue({
        action: actionEvent?.type === 'action' ? actionEvent.name : null
      }, Date.now());
      if (cue) {
        const leadMs = Math.max(0, cue.emitAt - Date.now());
        const leadCompleted = await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (completed: boolean): void => {
            if (settled) return;
            settled = true;
            cancelCueLeadRef.current = null;
            registerCancel(null);
            resolve(completed);
          };
          const timer = window.setTimeout(() => finish(true), leadMs);
          const cancel = (): void => {
            window.clearTimeout(timer);
            finish(false);
          };
          cancelCueLeadRef.current = cancel;
          registerCancel(cancel);
        });
        if (!leadCompleted || generation !== speechGenerationRef.current || !phraseCueSchedulerRef.current.isCurrent(cue.id)) return;
        emitPresentationEvents(presentation.playback, actionGateRef.current);
        phraseCueSchedulerRef.current.cancel(cue.id);
      }
      await playAnalyzedSpeech(segment, source, settingsRef.current, registerCancel);
    });
    playbackTailRef.current = playback.catch((reason: unknown) => {
      if (generation !== speechGenerationRef.current) return;
      clearEmotionFlushTimer();
      expressionGateRef.current.reset();
      actionGateRef.current.reset();
      finishDialoguePresentation();
      setError(reason instanceof Error ? reason.message : '语音播放失败');
    });
  };

  useEffect(() => {
    let disposed = false;
    disposedRef.current = false;
    const unsubscribe = window.starchat.chat.onEvent((event) => {
      if (disposed) return;
      if (event.requestId !== activeId.current) return;
      if (event.type === 'delta') {
        assistantText.current += event.delta;
        if (!replyStartedRef.current) {
          replyStartedRef.current = true;
          emitDialogue('replying');
        }
        for (const sentence of sentenceBufferRef.current.push(event.delta)) enqueueSpeech(sentence);
        setMessages((current) => {
          const next = [...current];
          if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: assistantText.current };
          return next;
        });
      } else if (event.type === 'complete') {
        const finalText = assistantText.current || event.response;
        for (const sentence of sentenceBufferRef.current.flush()) enqueueSpeech(sentence);
        const generation = speechGenerationRef.current;
        void playbackTailRef.current.then(() => {
          if (generation !== speechGenerationRef.current) return;
          clearEmotionFlushTimer();
          expressionGateRef.current.reset();
          actionGateRef.current.reset();
          finishDialoguePresentation();
        });
        setMessages((current) => {
          const next = [...current];
          if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: finalText };
          return next.slice(-20);
        });
        activeId.current = null;
        setRequestId(null);
      } else {
        cancelSpeech();
        setError(event.message);
        activeId.current = null;
        setRequestId(null);
      }
    });
     return () => {
       disposed = true;
       disposedRef.current = true;
       unsubscribe();
      const request = activeId.current;
      if (request) void window.starchat.chat.cancel(request);
      activeId.current = null;
       setRequestId(null);
       cancelSpeech();
       stopVoiceInput();
     };
  }, []);

  useEffect(() => {
    if (!isListening) return undefined;
    const timer = window.setInterval(() => {
      if (vadRef.current.tick()) stopVoiceInput();
    }, 200);
    return () => window.clearInterval(timer);
  }, [isListening]);

  useEffect(() => {
    if (!agentEvent || agentEvent === lastAgentEventRef.current) return;
    lastAgentEventRef.current = agentEvent;
    if (agentEvent.type === 'task') {
      if (agentEvent.task.roleId !== state.role.id || (activeId.current && agentEvent.task.id !== activeId.current)) return;
      setSelectedAgentTaskId(agentEvent.task.id);
      setHideHistoricalAgentTask(false);
      if (agentEvent.task.status === 'running') {
        setMessages((current) => {
          const next = [...current];
          if (next.at(-1)?.role === 'assistant' && !next.at(-1)?.content) next[next.length - 1] = { role: 'assistant', content: '我接手了，先在后台处理，完成后告诉你。' };
          return next;
        });
      }
      if (!['queued', 'running', 'completed', 'waiting_for_approval', 'waiting_for_input'].includes(agentEvent.task.status) && activeId.current === agentEvent.task.id) {
        const status = AGENT_TASK_STATUS_LABELS[agentEvent.task.status];
        if (agentEvent.task.status !== 'completed') {
          setMessages((current) => {
            const next = [...current];
            if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: agentEvent.task.error ?? status.description };
            return next;
          });
        }
        if (agentEvent.task.status !== 'waiting_for_approval' && agentEvent.task.status !== 'waiting_for_input') {
          cancelSpeech();
          activeId.current = null;
          setRequestId(null);
        }
      }
      return;
    }
    if (agentEvent.taskId !== activeId.current) return;
    setSelectedAgentTaskId(agentEvent.taskId);
    setHideHistoricalAgentTask(false);
    if (agentEvent.type === 'complete') {
      setMessages((current) => {
        const next = [...current];
        if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: agentEvent.result.summary };
        else next.push({ role: 'assistant', content: agentEvent.result.summary });
        return next.slice(-20);
      });
      enqueueSpeech(agentEvent.result.summary);
      void playbackTailRef.current.then(() => finishDialoguePresentation());
      activeId.current = null;
      setRequestId(null);
    } else if (agentEvent.type === 'error') {
      setError(agentEvent.message);
      cancelSpeech();
      activeId.current = null;
      setRequestId(null);
    }
  }, [agentEvent, state.role.id]);

  useEffect(() => {
    setShowEarlierMessages(false);
  }, [sessionId]);

  useEffect(() => {
    if (!compact) {
      setTaskDetailsOpen(true);
      return;
    }
    setTaskDetailsOpen(Boolean(agentTask && isActiveAgentTaskStatus(agentTask.status)));
  }, [agentTask?.id, agentTask?.status, compact]);

  const send = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || requestId || !sessionId) return;
    if (state.settings.assistantMode === 'agent' && !workspaceAvailable) {
      setError('Agent 任务需要先选择工作区，个人会话仍可继续普通对话。');
      onRequestWorkspace();
      return;
    }
    stopVoiceInput();
    cancelSpeech();
    emitDialogue('start');
    emitDialogue('listening');
    setError(null);
    setDraft('');
    setSelectedAgentTaskId(null);
    setHideHistoricalAgentTask(true);
    assistantText.current = '';
    const history = messages.filter((item) => item.content.trim()).slice(-18);
    onMessageSent?.(message);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    try {
       const id = await window.starchat.chat.start({ message, history, mode: state.settings.assistantMode, sessionId });
       if (disposedRef.current) {
         void window.starchat.chat.cancel(id);
         return;
       }
       activeId.current = id;
      setSelectedAgentTaskId(id);
      setRequestId(id);
    } catch (reason) {
      cancelSpeech();
      setError(reason instanceof Error ? reason.message : '无法开始对话');
    }
  };

  const stop = (): void => {
    if (requestId) {
      const isAgentTask = agentTask?.id === requestId || agentTasks.some((task) => task.id === requestId);
      if (isAgentTask) void window.starchat.agent.cancel(requestId);
      else void window.starchat.chat.cancel(requestId);
    }
    stopVoiceInput();
    cancelSpeech();
    activeId.current = null;
    setRequestId(null);
  };

  const hasActiveTask = Boolean(agentTask && ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(agentTask.status));
  const waitingForApproval = agentTask?.status === 'waiting_for_approval' && agentTask.approval;
  const waitingForInput = agentTask?.status === 'waiting_for_input' && agentTask.input;
  const showTaskDisclosure = Boolean(agentTask && (!compact || hasActiveTask || selectedAgentTaskId));
  const visibleAgentTask = showTaskDisclosure ? agentTask : null;
  const approve = async (approved: boolean): Promise<void> => {
    if (!waitingForApproval) return;
    try { await window.starchat.agent.approve({ taskId: waitingForApproval.taskId, requestId: waitingForApproval.id, approved }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '审批失败'); }
  };
  const contextUsage = estimateContextUsage(messages, draft);
  const contextPercent = contextUsageOverride ?? contextUsage.percent;
  const modelLabel = referenceFixture ? '默认模型' : state.settings.model;
  const temperatureLabel = referenceFixture ? '轻度' : `温度 ${state.settings.temperature.toFixed(2)}`;
  const handleAgentApprove = async (approved: boolean): Promise<void> => {
    await approve(approved);
  };
  const handleAgentRespond = async (value: string): Promise<void> => {
    if (!waitingForInput) return;
    try {
      await window.starchat.agent.respond({ taskId: waitingForInput.taskId, requestId: waitingForInput.id, value });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '补充信息失败');
    }
  };

  return <div className={`companion-chat${compact ? ' is-compact' : ''}`} data-agent-ui="chat" data-progressive-disclosure={compact ? 'true' : 'false'}>
    {showStatusSummary ? <div className="companion-status">
      <span>关系阶段<strong>{state.companion.stageLabel}</strong></span>
      <span>亲密度<strong>{state.companion.affinity}/100</strong></span>
      <span>互动<strong>{state.companion.interactionCount}</strong></span>
      <span>记忆<strong>{state.companion.memoryCount}</strong></span>
    </div> : null}
    {showRouteControl ? <div className="companion-route-control"><label htmlFor="assistant-mode">处理模式</label><GlassSelect id="assistant-mode" ariaLabel="对话路由模式" value={state.settings.assistantMode} options={AGENT_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} onChange={(value) => onModeChange?.(value as AgentMode)} /><small>{AGENT_MODE_OPTIONS.find((option) => option.value === state.settings.assistantMode)?.description}</small></div> : null}
    <div className="companion-messages" data-agent-ui="messages" aria-live="polite" aria-label="对话消息">
       {!workspaceAvailable && state.settings.assistantMode === 'agent' ? <div className="agent-workspace-empty" role="status"><strong>请先选择工作区运行 Agent</strong><span>当前是个人会话；授权项目目录后即可运行文件、测试和构建任务。</span><button type="button" className="secondary-button" onClick={onRequestWorkspace}>选择工作区</button></div> : null}
      {workspaceAvailable && messages.length === 0 && showRouteControl ? <p className="detail-note">开始和{state.role.displayName}说话。人格、关系阶段与记忆会在每次请求时生成快照。</p> : null}
      {hiddenMessageCount > 0 ? <button className="companion-history-disclosure" type="button" onClick={() => setShowEarlierMessages(true)}>显示较早的 {hiddenMessageCount} 条消息</button> : null}
      {visibleMessages.map((message, index) => <div className={`companion-message ${message.role}`} key={`${message.role}-${hiddenMessageCount + index}`}><strong>{message.role === 'user' ? '你' : state.role.displayName}</strong><p>{message.content || '…'}</p></div>)}
    </div>
    {error ? <p className="error-banner">{error}</p> : null}
    {visibleAgentTask ? <details className="companion-task-disclosure" data-agent-ui="task-disclosure" open={!compact || taskDetailsOpen} onToggle={(event) => setTaskDetailsOpen(event.currentTarget.open)}>
      <summary className="companion-task-summary"><span><WorkbenchIcon name={hasActiveTask ? 'agentStep' : 'check'} size={14} />{AGENT_TASK_STATUS_LABELS[visibleAgentTask.status].label}</span><span>{currentAgentStep(visibleAgentTask)}</span></summary>
      <div aria-label="当前步骤"><AgentTaskPanel task={visibleAgentTask} onApprove={(approved) => void handleAgentApprove(approved)} onRespond={(value) => void handleAgentRespond(value)} onCancel={hasActiveTask ? stop : undefined} /></div>
    </details> : null}
      <div className={`companion-composer agent-composer${referenceFixture ? ' is-reference-fixture' : ''}`} data-agent-ui="composer">
      <div className="agent-composer-header"><div className="agent-attachment-slots" data-agent-ui="attachments" aria-label="附件状态">{referenceFixture ? <><span className="agent-attachment-slot agent-attachment-preview"><span className="agent-attachment-code-preview" aria-hidden="true" /><span className="agent-attachment-remove" aria-hidden="true"><WorkbenchIcon name="close" size={11} /></span></span><span className="agent-attachment-slot agent-attachment-label">分销 45秒<span className="agent-attachment-remove" aria-hidden="true"><WorkbenchIcon name="close" size={11} /></span></span></> : <span className="agent-attachment-empty">当前仅支持文本消息，未添加附件</span>}</div></div>
      <div className="agent-compose-row"><textarea aria-label="输入消息" value={draft} rows={3} disabled={!sessionId} placeholder={!sessionId ? '正在准备个人会话' : workspaceAvailable ? '向 StarChat 发送消息' : '个人对话；Agent 任务需选择工作区'} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /></div>
       <div className="agent-composer-footer agent-composer-tools" data-agent-ui="composer-tools"><button className="agent-composer-control" type="button" aria-label="添加工具未启用" disabled title="工具由 Agent 根据安全策略自动选择"><WorkbenchIcon name="plus" size={15} /></button>{referenceFixture ? <span className="agent-composer-control" data-agent-composer-control="approval" aria-label="审批入口预览"><WorkbenchIcon name="agentStep" size={14} />帮我批准</span> : null}{waitingForApproval ? <button className="agent-composer-control" type="button" data-agent-composer-control="approval" aria-label="审批" onClick={() => void approve(true)}><WorkbenchIcon name="check" size={14} />批准</button> : null}<span className="agent-composer-control is-context" data-agent-composer-control="context" aria-label={`上下文占用，剩余 ${Math.max(0, 100 - contextPercent)}%`}><WorkbenchIcon name="context" size={14} />剩余上下文 {Math.max(0, 100 - contextPercent)}%</span><span className="agent-composer-control" data-agent-composer-control="model" title={`当前模型：${modelLabel}`}>{referenceFixture ? null : <WorkbenchIcon name="model" size={14} />}{modelLabel}{referenceFixture ? <WorkbenchIcon name="chevron" size={12} /> : null}</span><span className="agent-composer-control" data-agent-composer-control="temperature" title={`生成强度：${temperatureLabel}`}>{referenceFixture ? null : <WorkbenchIcon name="strength" size={14} />}{temperatureLabel}{referenceFixture ? <WorkbenchIcon name="chevron" size={12} /> : null}</span><button className={`agent-composer-control is-mic${isListening ? ' is-active' : ''}`} type="button" data-agent-composer-control="mic" aria-label={isListening ? '停止语音输入' : voiceAvailable ? '开始语音输入' : '语音输入不可用'} disabled={!voiceAvailable && !isListening} onClick={toggleVoiceInput} title={isListening ? '停止语音输入' : voiceAvailable ? '手动语音输入，不会自动发送' : '当前运行环境未提供手动语音识别'}><WorkbenchIcon name="mic" size={15} /></button><button className="agent-send-button" type="button" aria-label="发送消息" disabled={!sessionId || !draft.trim() || Boolean(requestId)} onClick={() => void send()}><WorkbenchIcon name="sendUp" size={22} /></button>{requestId ? <button className="agent-composer-control" type="button" onClick={stop}>停止</button> : null}</div>
    </div>
    {!compact ? <p className="runtime-capability-note">语音提供器：CosyVoice · {state.settings.cosyVoiceSpeaker}；回复按句播放，口型由实际音频包络驱动。输入支持手动语音识别，静音后停止，不会自动发送。</p> : null}
  </div>;
}
