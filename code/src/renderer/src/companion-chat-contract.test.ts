import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const chatSource = readFileSync(resolve(testDirectory, 'CompanionChat.tsx'), 'utf8');
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');

describe('conversation presentation contracts', () => {
  it('resets expression, motion and gaze before every new dialogue request', () => {
    const send = chatSource.slice(chatSource.indexOf('const send ='), chatSource.indexOf('const stop ='));

    expect(send).toContain('cancelSpeech()');
    expect(chatSource).toContain("type: 'control'");
    expect(chatSource).toContain("name: 'neutral'");
    expect(chatSource).toContain("source: 'system'");
    expect(canvasSource).toContain("event.type === 'control'");
    expect(canvasSource).toContain('runtime.controller.neutral()');
    expect(canvasSource).toContain('runtime.controller.releaseFocus()');
  });

  it('finishes a reply through one neutral cleanup path on completion, cancellation, and TTS failure', () => {
    expect(chatSource).toContain('finishDialoguePresentation');
    expect(chatSource).toContain('finishDialoguePresentation();');
    expect(chatSource).toContain("type: 'control'");
    expect(chatSource).toContain("name: 'neutral'");
    expect(chatSource).toContain('playbackTailRef.current = playback.catch');
  });

  it('keeps completed-sentence expression emission independent from TTS synthesis', () => {
    const enqueue = chatSource.slice(chatSource.indexOf('const enqueueSpeech'), chatSource.indexOf('useEffect(() =>'));
    expect(enqueue.indexOf('emitPresentationEvents(presentation.realtime')).toBeGreaterThanOrEqual(0);
    expect(enqueue.indexOf('emitPresentationEvents(presentation.realtime')).toBeLessThan(enqueue.indexOf('window.baoyin.tts.synthesize'));
    expect(enqueue.indexOf('emitPresentationEvents(presentation.playback')).toBeLessThan(enqueue.indexOf('await playAnalyzedSpeech'));
    expect(chatSource).toContain('const actionGateRef = useRef(new EmotionCueGate(0));');
  });
});
