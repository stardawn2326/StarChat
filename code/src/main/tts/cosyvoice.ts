import type { AppSettings } from '../../shared/settings';

const COSYVOICE_SFT_SAMPLE_RATE = 22050;
const MAX_TTS_TEXT_LENGTH = 2000;

export function pcm16ToWav(pcm: Uint8Array, sampleRate = COSYVOICE_SFT_SAMPLE_RATE): Uint8Array {
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) wav[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}

export type CosyVoicePrompt = { mode: 'sft'; speaker: string } | { mode: 'zero-shot'; promptText: string; promptWav: Uint8Array };

export function buildCosyVoiceRequest(text: string, prompt: CosyVoicePrompt, baseUrl: string): { endpoint: URL; form: FormData; sampleRate: number } {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('语音文本不能为空');
  if (cleanText.length > MAX_TTS_TEXT_LENGTH) throw new Error(`单次语音不能超过 ${MAX_TTS_TEXT_LENGTH} 个字符`);
  const endpoint = new URL(prompt.mode === 'zero-shot' ? '/inference_zero_shot' : '/inference_sft', `${baseUrl}/`);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('CosyVoice 地址只允许 HTTP 或 HTTPS');
  const form = new FormData();
  form.set('tts_text', cleanText);
  if (prompt.mode === 'sft') form.set('spk_id', prompt.speaker);
  else {
    form.set('prompt_text', prompt.promptText);
    form.set('prompt_wav', new Blob([Uint8Array.from(prompt.promptWav).buffer], { type: 'audio/wav' }), 'reference.wav');
  }
  return { endpoint, form, sampleRate: prompt.mode === 'zero-shot' ? 24000 : 22050 };
}

export async function synthesizeCosyVoice(text: string, settings: AppSettings, zeroShot?: { promptText: string; promptWav: Uint8Array }): Promise<string> {
  const { endpoint, form, sampleRate } = buildCosyVoiceRequest(text, zeroShot
    ? { mode: 'zero-shot', ...zeroShot }
    : { mode: 'sft', speaker: settings.cosyVoiceSpeaker }, settings.cosyVoiceBaseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new Error(`无法连接 CosyVoice：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`CosyVoice 返回 HTTP ${response.status}`);
  const pcm = new Uint8Array(await response.arrayBuffer());
  if (pcm.byteLength === 0) throw new Error('CosyVoice 返回了空音频');
  const wav = pcm16ToWav(pcm, sampleRate);
  return `data:audio/wav;base64,${Buffer.from(wav).toString('base64')}`;
}
