export interface SttHandlers {
  onText: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface SttProvider {
  readonly name: string;
  isAvailable(): boolean;
  start(handlers: SttHandlers): void;
  stop(): void;
}
