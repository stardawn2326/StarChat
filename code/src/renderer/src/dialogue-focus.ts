export type DialogueFocusPhase = 'start' | 'listening' | 'replying' | 'end';

export interface DialogueFocusDecision {
  active: boolean;
  release: boolean;
  resume: boolean;
}

/**
 * Owns only the arbitration state between dialogue and cursor follow. It does
 * not write model parameters or replace the package FocusController.
 */
export class DialogueFocusGate {
  private active = false;

  transition(phase: DialogueFocusPhase): DialogueFocusDecision {
    if (phase === 'end') {
      const resume = this.active;
      this.active = false;
      return { active: false, release: false, resume };
    }
    const release = !this.active && phase === 'start';
    this.active = true;
    return { active: true, release, resume: false };
  }

  isActive(): boolean {
    return this.active;
  }

  shouldIgnoreCursor(): boolean {
    return this.active;
  }
}
