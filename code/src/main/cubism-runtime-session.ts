import { resolve } from 'node:path';

export interface CubismRuntimeSessionState {
  currentModelIdentity: string | null;
  readyModelIdentity: string | null;
  ready: boolean;
}

function canonicalIdentity(identity: string | null | undefined): string | null {
  if (typeof identity !== 'string' || !identity.trim()) return null;
  try {
    return resolve(identity).toLocaleLowerCase();
  } catch {
    return identity.replaceAll('\\', '/').toLocaleLowerCase();
  }
}

export class CubismRuntimeSession {
  private currentModelIdentity: string | null = null;
  private readyModelIdentity: string | null = null;

  setCurrentModel(identity: string | null | undefined): void {
    this.currentModelIdentity = canonicalIdentity(identity);
    this.readyModelIdentity = null;
  }

  markReady(identity: string | null | undefined): boolean {
    const candidate = canonicalIdentity(identity);
    if (!candidate || candidate !== this.currentModelIdentity) return false;
    this.readyModelIdentity = candidate;
    return true;
  }

  markFailed(identity: string | null | undefined): void {
    const candidate = canonicalIdentity(identity);
    if (candidate === this.currentModelIdentity) this.readyModelIdentity = null;
  }

  isReady(identity: string | null | undefined): boolean {
    const candidate = canonicalIdentity(identity);
    return Boolean(candidate && candidate === this.currentModelIdentity && candidate === this.readyModelIdentity);
  }

  state(): CubismRuntimeSessionState {
    return {
      currentModelIdentity: this.currentModelIdentity,
      readyModelIdentity: this.readyModelIdentity,
      ready: this.isReady(this.currentModelIdentity)
    };
  }
}
