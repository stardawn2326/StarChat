import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { VoiceProfile } from '../shared/voice-profile';

interface StoredVoiceProfile extends VoiceProfile { audioFileName: string }

function inspectWav(filePath: string): number {
  if (statSync(filePath).size > 50 * 1024 * 1024) throw new Error('参考 WAV 不能超过 50 MB');
  const data = readFileSync(filePath);
  if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('参考音频必须是有效 WAV 文件');
  }
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= data.length) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (id === 'fmt ' && size >= 16 && offset + 20 <= data.length) byteRate = data.readUInt32LE(offset + 16);
    if (id === 'data') { dataSize = Math.min(size, data.length - offset - 8); break; }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize) throw new Error('参考音频必须是有效 WAV 文件');
  const duration = dataSize / byteRate;
  if (duration < 3 || duration > 30) throw new Error('参考音频时长必须为 3–30 秒');
  return duration;
}

export class VoiceProfileStore {
  private readonly metadataPath: string;
  private readonly audioDir: string;
  constructor(private readonly baseDir: string) {
    this.metadataPath = join(baseDir, 'voice-profiles.json');
    this.audioDir = join(baseDir, 'voices');
  }
  private readStored(): StoredVoiceProfile[] {
    if (!existsSync(this.metadataPath)) return [];
    try {
      const value = JSON.parse(readFileSync(this.metadataPath, 'utf8')) as StoredVoiceProfile[];
      return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && typeof item.audioFileName === 'string') : [];
    } catch { return []; }
  }
  private write(items: StoredVoiceProfile[]): void {
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(this.metadataPath, JSON.stringify(items, null, 2), 'utf8');
  }
  list(): VoiceProfile[] {
    return this.readStored().map(({ audioFileName: _audioFileName, ...profile }) => profile);
  }
  importWav(sourcePath: string, input: { name: string; promptText: string }): VoiceProfile {
    const name = input.name.trim(); const promptText = input.promptText.trim();
    if (!name) throw new Error('音色名称不能为空');
    if (!promptText) throw new Error('参考音频对应文本不能为空');
    if (promptText.length > 500) throw new Error('参考文本不能超过 500 个字符');
    const durationSeconds = inspectWav(sourcePath);
    const id = `voice.${randomUUID()}`; const audioFileName = `${id}.wav`;
    mkdirSync(this.audioDir, { recursive: true });
    copyFileSync(sourcePath, join(this.audioDir, audioFileName));
    const stored: StoredVoiceProfile = { id, name, promptText, sourceFileName: basename(sourcePath), durationSeconds, createdAt: Date.now(), audioFileName };
    this.write([...this.readStored(), stored]);
    const { audioFileName: _audioFileName, ...profile } = stored;
    return profile;
  }
  audioPath(id: string): string {
    const item = this.readStored().find((profile) => profile.id === id);
    if (!item) throw new Error('音色不存在');
    return join(this.audioDir, item.audioFileName);
  }
  delete(id: string): void {
    const items = this.readStored(); const item = items.find((profile) => profile.id === id);
    if (!item) return;
    const path = join(this.audioDir, item.audioFileName);
    if (existsSync(path)) unlinkSync(path);
    this.write(items.filter((profile) => profile.id !== id));
  }
}
