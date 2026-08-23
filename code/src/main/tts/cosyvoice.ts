import type { AppSettings } from '../../shared/settings';

const COSYVOICE_SAMPLE_RATE = 22050;
const MAX_TTS_TEXT_LENGTH = 2000;

export function pcm16ToWav(pcm: Uint8Array, sampleRate = COSYVOICE_SAMPLE_RATE): Uint8Array {
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

export async function synthesizeCosyVoice(text: string, settings: AppSettings): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('语音文本不能为空');
  if (cleanText.length > MAX_TTS_TEXT_LENGTH) throw new Error(`单次语音不能超过 ${MAX_TTS_TEXT_LENGTH} 个字符`);

  const endpoint = new URL('/inference_sft', `${settings.cosyVoiceBaseUrl}/`);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('CosyVoice 地址只允许 HTTP 或 HTTPS');
  const form = new FormData();
  form.set('tts_text', cleanText);
  form.set('spk_id', settings.cosyVoiceSpeaker);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new Error(`无法连接 CosyVoice：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`CosyVoice 返回 HTTP ${response.status}`);
  const pcm = new Uint8Array(await response.arrayBuffer());
  if (pcm.byteLength === 0) throw new Error('CosyVoice 返回了空音频');
  const wav = pcm16ToWav(pcm);
  return `data:audio/wav;base64,${Buffer.from(wav).toString('base64')}`;
}
