import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PublicAppState } from '../../shared/ipc';

interface CompanionChatProps { state: PublicAppState }

function speak(text: string): void {
  if (!text.trim() || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.onstart = () => window.baoyin.presentation.emit({ type: 'speech', speaking: true, source: 'assistant' });
  utterance.onend = utterance.onerror = () => window.baoyin.presentation.emit({ type: 'speech', speaking: false, source: 'assistant' });
  window.speechSynthesis.speak(utterance);
}

export function CompanionChat({ state }: CompanionChatProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = useRef<string | null>(null);
  const assistantText = useRef('');

  useEffect(() => window.baoyin.chat.onEvent((event) => {
    if (event.requestId !== activeId.current) return;
    if (event.type === 'delta') {
      assistantText.current += event.delta;
      setMessages((current) => {
        const next = [...current];
        if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: assistantText.current };
        return next;
      });
    } else if (event.type === 'complete') {
      const finalText = assistantText.current || event.response;
      setMessages((current) => {
        const next = [...current];
        if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: finalText };
        return next.slice(-20);
      });
      activeId.current = null;
      setRequestId(null);
      speak(finalText);
    } else {
      setError(event.message);
      activeId.current = null;
      setRequestId(null);
    }
  }), []);

  const send = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || requestId) return;
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
    <div className="companion-composer"><textarea value={draft} rows={3} placeholder="输入消息，Enter发送，Shift+Enter换行" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="primary-button" type="button" disabled={!draft.trim() || Boolean(requestId)} onClick={() => void send()}>发送</button>{requestId ? <button className="secondary-button" type="button" onClick={() => void window.baoyin.chat.cancel(requestId)}>停止</button> : null}</div>
    <p className="runtime-capability-note">语音使用当前可用的中文系统声音；播放时驱动模型口型。API Key只保存在主进程用户数据目录。</p>
  </div>;
}
