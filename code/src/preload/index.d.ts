import type { StarChatBridge } from './index';

declare global {
  interface Window {
    starchat: StarChatBridge;
  }
}

export {};
