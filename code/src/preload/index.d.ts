import type { BaoyinBridge } from './index';

declare global {
  interface Window {
    baoyin: BaoyinBridge;
  }
}

export {};
