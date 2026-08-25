import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PublicAppState } from '../../shared/ipc';
import type { ExpressionName, RoleSemanticMapping } from '../../shared/role-package';
import type { AppSettings } from '../../shared/settings';
import { presentationForAssistantText } from '../../shared/companion';
import { AGENT_MODE_OPTIONS, type AgentMode, type AgentTask } from '../../shared/agent';
import {
  EmotionCueGate,
  LipSyncEnvelope,
  PhraseCueScheduler,
  StreamingSentenceBuffer,
  splitRealtimePresentation,
  mouthFormAtProgress,
  timeDomainRms
} from './speech-performance';

interface CompanionChatProps { state: PublicAppState; onModeChange?: (mode: AgentMode) => void }

type CancelPlayback = (() => void) | null;

function emitSpeech(speaking: boolean, mouthOpen = 0, mouthForm = 0): void {
  window.baoyin.presentation.emit({
    type: 'speech',
    speaking,
    source: 'assistant',
    mouthOpen: Math.min(1, Math.max(0, mouthOpen)),
    mouthForm: Math.min(1, Math.max(-1, mouthForm)),
    timestamp: Date.now()
  });
}

function emitDialogue(phase: 'start' | 'listening' | 'replying' | 'end'): void {
  window.baoyin.presentation.emit({
    type: 'dialogue',
    phase,
    source: 'system',
    timestamp: Date.now()
  });
}

function emitNeutralPresentation(): void {
  window.baoyin.presentation.emit({
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
    window.baoyin.presentation.emit(event);
  }
}

function segmentPresentation(
  text: string,
  mappings: Readonly<Record<string, RoleSemanticMapping>>
): ReturnType<typeof splitRealtimePresentation> {
  return splitRealtimePresentation(presentationForAssistantText(text, mappings));
}

export function CompanionChat({ state, onModeChange }: CompanionChatProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentTask, setAgentTask] = useState<AgentTask | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const activeId = useRef<string | null>(null);
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
  settingsRef.current = state.settings;
  mappingsRef.current = state.role.presentation.semanticMappings;

  const clearEmotionFlushTimer = (): void => {
    if (emotionFlushTimerRef.current === null) return;
    window.clearTimeout(emotionFlushTimerRef.current);
    emotionFlushTimerRef.current = null;
  };

  const flushPendingEmotion = (): void => {
    emotionFlushTimerRef.current = null;
    const expression = expressionGateRef.current.flush(Date.now());
    if (!expression) return;
    window.baoyin.presentation.emit({
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
      return window.baoyin.tts.synthesize(segment);
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
    const unsubscribe = window.baoyin.chat.onEvent((event) => {
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
      unsubscribe();
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void window.baoyin.agent.list().then((tasks) => {
      const latest = tasks.find((task) => task.roleId === state.role.id && ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(task.status));
      if (!disposed && latest) setAgentTask(latest);
    }).catch(() => undefined);
    const unsubscribe = window.baoyin.agent.onEvent((event) => {
      if (disposed || event.taskId !== activeId.current) return;
      if (event.type === 'task') {
        setAgentTask(event.task);
        if (event.task.status === 'running') {
          setMessages((current) => {
            const next = [...current];
            if (next.at(-1)?.role === 'assistant' && !next.at(-1)?.content) next[next.length - 1] = { role: 'assistant', content: '我接手了，先在后台处理，完成后告诉你。' };
            return next;
          });
        }
      } else if (event.type === 'approval') {
        setAgentTask((current) => current ? { ...current, status: 'waiting_for_approval', approval: event.request } : current);
      } else if (event.type === 'input') {
        setAgentTask((current) => current ? { ...current, status: 'waiting_for_input', input: event.request } : current);
      } else if (event.type === 'complete') {
        setAgentTask((current) => current ? { ...current, status: 'completed', result: event.result } : current);
        setMessages((current) => {
          const next = [...current];
          if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: event.result.summary };
          else next.push({ role: 'assistant', content: event.result.summary });
          return next.slice(-20);
        });
        enqueueSpeech(event.result.summary);
        void playbackTailRef.current.then(() => finishDialoguePresentation());
        activeId.current = null;
        setRequestId(null);
      } else if (event.type === 'error') {
        setAgentTask((current) => current ? { ...current, status: 'failed', error: event.message } : current);
        setError(event.message);
        cancelSpeech();
        activeId.current = null;
        setRequestId(null);
      }
    });
    return () => { disposed = true; unsubscribe(); };
  }, [state.role.id]);

  const send = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || requestId) return;
    cancelSpeech();
    emitDialogue('start');
    emitDialogue('listening');
    setError(null);
    setDraft('');
    assistantText.current = '';
    const history = messages.filter((item) => item.content.trim()).slice(-18);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    try {
      const id = await window.baoyin.chat.start({ message, history, mode: state.settings.assistantMode });
      activeId.current = id;
      setRequestId(id);
      if (state.settings.assistantMode !== 'companion') {
        void window.baoyin.agent.get(id).then((task) => {
          if (!task || activeId.current !== id) return;
          setAgentTask(task);
          if (task.status === 'failed' && task.error) {
            setError(task.error);
            activeId.current = null;
            setRequestId(null);
          }
          if (task.status === 'completed' && task.result) {
            setMessages((current) => {
              const next = [...current];
              if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: task.result!.summary };
              return next.slice(-20);
            });
            enqueueSpeech(task.result.summary);
            activeId.current = null;
            setRequestId(null);
          }
        }).catch(() => undefined);
      }
    } catch (reason) {
      cancelSpeech();
      setError(reason instanceof Error ? reason.message : '无法开始对话');
    }
  };

  const stop = (): void => {
    if (requestId) {
      const isAgentTask = agentTask?.id === requestId;
      if (isAgentTask) void window.baoyin.agent.cancel(requestId);
      else void window.baoyin.chat.cancel(requestId);
    }
    cancelSpeech();
    activeId.current = null;
    setRequestId(null);
  };

  const waitingForApproval = agentTask?.status === 'waiting_for_approval' && agentTask.approval;
  const waitingForInput = agentTask?.status === 'waiting_for_input' && agentTask.input;
  const approve = async (approved: boolean): Promise<void> => {
    if (!waitingForApproval) return;
    try { await window.baoyin.agent.approve({ taskId: waitingForApproval.taskId, requestId: waitingForApproval.id, approved }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '审批失败'); }
  };
  const respond = async (): Promise<void> => {
    if (!waitingForInput || !agentInput.trim()) return;
    try { await window.baoyin.agent.respond({ taskId: waitingForInput.taskId, requestId: waitingForInput.id, value: agentInput.trim() }); setAgentInput(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '补充信息失败'); }
  };

  return <div className="companion-chat">
    <div className="companion-status">
      <span>关系阶段<strong>{state.companion.stageLabel}</strong></span>
      <span>亲密度<strong>{state.companion.affinity}/100</strong></span>
      <span>互动<strong>{state.companion.interactionCount}</strong></span>
      <span>记忆<strong>{state.companion.memoryCount}</strong></span>
    </div>
    <div className="companion-route-control"><label htmlFor="assistant-mode">处理模式</label><select id="assistant-mode" aria-label="对话路由模式" value={state.settings.assistantMode} onChange={(event) => onModeChange?.(event.target.value as AgentMode)}>{AGENT_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{AGENT_MODE_OPTIONS.find((option) => option.value === state.settings.assistantMode)?.description}</small></div>
    <div className="companion-messages" aria-live="polite">
      {messages.length === 0 ? <p className="detail-note">开始和{state.role.displayName}说话。人格、关系阶段与记忆会在每次请求时生成快照。</p> : null}
      {messages.map((message, index) => <div className={`companion-message ${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'user' ? '你' : state.role.displayName}</strong><p>{message.content || '…'}</p></div>)}
    </div>
    {error ? <p className="error-banner">{error}</p> : null}
    {agentTask?.status === 'running' || agentTask?.status === 'queued' ? <p className="security-note" role="status">后台任务：{agentTask.status === 'queued' ? '排队中' : '执行中'} · 工具日志不会进入关系记忆。</p> : null}
    {agentTask && ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(agentTask.status) && agentTask.steps.at(-1)?.summary ? <p className="security-note" role="status">当前步骤：{agentTask.steps.at(-1)?.summary}</p> : null}
    {waitingForApproval ? <div className="status-callout agent-approval" role="dialog"><strong>需要你的许可</strong><span>目标：{waitingForApproval.target}</span><small>{waitingForApproval.plan}</small><div className="toolbar"><button className="primary-button" type="button" onClick={() => void approve(true)}>批准这次计划</button><button className="secondary-button" type="button" onClick={() => void approve(false)}>拒绝</button></div></div> : null}
    {waitingForInput ? <div className="status-callout agent-input"><strong>需要补充信息</strong><span>{waitingForInput.prompt}</span><div className="companion-composer"><input value={agentInput} onChange={(event) => setAgentInput(event.target.value)} /><button className="primary-button" type="button" disabled={!agentInput.trim()} onClick={() => void respond()}>继续</button></div></div> : null}
    <div className="companion-composer"><textarea value={draft} rows={3} placeholder="输入消息，Enter发送，Shift+Enter换行" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="primary-button" type="button" disabled={!draft.trim() || Boolean(requestId)} onClick={() => void send()}>发送</button>{requestId ? <button className="secondary-button" type="button" onClick={stop}>停止</button> : null}</div>
    <p className="runtime-capability-note">语音提供器：CosyVoice · {state.settings.cosyVoiceSpeaker}；回复按句播放，口型由实际音频包络驱动。</p>
  </div>;
}
