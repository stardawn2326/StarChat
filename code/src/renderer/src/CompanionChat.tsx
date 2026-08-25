import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PublicAppState } from '../../shared/ipc';
import type { RoleSemanticMapping } from '../../shared/role-package';
import type { AppSettings } from '../../shared/settings';
import { presentationForAssistantText } from '../../shared/companion';
import {
  EmotionCueGate,
  LipSyncEnvelope,
  StreamingSentenceBuffer,
  splitRealtimePresentation,
  mouthFormAtProgress,
  timeDomainRms
} from './speech-performance';

interface CompanionChatProps { state: PublicAppState }

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
    let finished = false;
    let lastSampleAt = performance.now();
    let lastEmitAt = Number.NEGATIVE_INFINITY;

    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
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

export function CompanionChat({ state }: CompanionChatProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = useRef<string | null>(null);
  const assistantText = useRef('');
  const settingsRef = useRef(state.settings);
  const mappingsRef = useRef(state.role.presentation.semanticMappings);
  const sentenceBufferRef = useRef(new StreamingSentenceBuffer());
  const synthesisTailRef = useRef<Promise<void>>(Promise.resolve());
  const playbackTailRef = useRef<Promise<void>>(Promise.resolve());
  const speechGenerationRef = useRef(0);
  const cancelPlaybackRef = useRef<CancelPlayback>(null);
  const expressionGateRef = useRef(new EmotionCueGate(1600));
  const actionGateRef = useRef(new EmotionCueGate(2200));
  settingsRef.current = state.settings;
  mappingsRef.current = state.role.presentation.semanticMappings;

  const cancelSpeech = (): void => {
    speechGenerationRef.current += 1;
    sentenceBufferRef.current.reset();
    cancelPlaybackRef.current?.();
    cancelPlaybackRef.current = null;
    synthesisTailRef.current = Promise.resolve();
    playbackTailRef.current = Promise.resolve();
    expressionGateRef.current.reset();
    actionGateRef.current.reset();
    emitSpeech(false);
  };

  const enqueueSpeech = (text: string): void => {
    const segment = text.trim();
    if (!segment) return;
    const generation = speechGenerationRef.current;
    const presentation = segmentPresentation(segment, mappingsRef.current);
    // A completed streamed sentence already contains enough meaning to update
    // the face. Do not wait for online TTS synthesis or the playback queue.
    emitPresentationEvents(presentation.realtime, expressionGateRef.current);
    const sourcePromise = synthesisTailRef.current.then(() => {
      if (generation !== speechGenerationRef.current) return '';
      return window.baoyin.tts.synthesize(segment);
    });
    synthesisTailRef.current = sourcePromise.then(() => undefined, () => undefined);
    const playback = playbackTailRef.current.then(async () => {
      const source = await sourcePromise;
      if (!source || generation !== speechGenerationRef.current) return;
      emitPresentationEvents(presentation.playback, actionGateRef.current);
      await playAnalyzedSpeech(segment, source, settingsRef.current, (cancel) => {
        if (generation === speechGenerationRef.current) cancelPlaybackRef.current = cancel;
      });
    });
    playbackTailRef.current = playback.catch((reason: unknown) => {
      if (generation !== speechGenerationRef.current) return;
      emitSpeech(false);
      setError(reason instanceof Error ? reason.message : '语音播放失败');
    });
  };

  useEffect(() => {
    const unsubscribe = window.baoyin.chat.onEvent((event) => {
      if (event.requestId !== activeId.current) return;
      if (event.type === 'delta') {
        assistantText.current += event.delta;
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
          emitSpeech(false);
          window.baoyin.presentation.emit({
            type: 'expression',
            name: 'neutral',
            source: 'assistant',
            layer: 'dialogue_emotion'
          });
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

  const send = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || requestId) return;
    cancelSpeech();
    setError(null);
    setDraft('');
    assistantText.current = '';
    const history = messages.filter((item) => item.content.trim()).slice(-18);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    try {
      const id = await window.baoyin.chat.start({ message, history });
      activeId.current = id;
      setRequestId(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法开始对话');
    }
  };

  const stop = (): void => {
    if (requestId) void window.baoyin.chat.cancel(requestId);
    cancelSpeech();
    activeId.current = null;
    setRequestId(null);
  };

  return <div className="companion-chat">
    <div className="companion-status">
      <span>关系阶段<strong>{state.companion.stageLabel}</strong></span>
      <span>亲密度<strong>{state.companion.affinity}/100</strong></span>
      <span>互动<strong>{state.companion.interactionCount}</strong></span>
      <span>记忆<strong>{state.companion.memoryCount}</strong></span>
    </div>
    <div className="companion-messages" aria-live="polite">
      {messages.length === 0 ? <p className="detail-note">开始和{state.role.displayName}说话。人格、关系阶段与记忆会在每次请求时生成快照。</p> : null}
      {messages.map((message, index) => <div className={`companion-message ${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'user' ? '你' : state.role.displayName}</strong><p>{message.content || '…'}</p></div>)}
    </div>
    {error ? <p className="error-banner">{error}</p> : null}
    <div className="companion-composer"><textarea value={draft} rows={3} placeholder="输入消息，Enter发送，Shift+Enter换行" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="primary-button" type="button" disabled={!draft.trim() || Boolean(requestId)} onClick={() => void send()}>发送</button>{requestId ? <button className="secondary-button" type="button" onClick={stop}>停止</button> : null}</div>
    <p className="runtime-capability-note">语音提供器：CosyVoice · {state.settings.cosyVoiceSpeaker}；回复按句播放，口型由实际音频包络驱动。</p>
  </div>;
}
