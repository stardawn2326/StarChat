export interface VoiceProfile {
  id: string;
  name: string;
  promptText: string;
  sourceFileName: string;
  durationSeconds: number;
  createdAt: number;
}

export interface VoiceImportRequest {
  name: string;
  promptText: string;
}

export interface VoiceIdRequest { id: string }
