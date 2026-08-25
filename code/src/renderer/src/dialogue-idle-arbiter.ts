export interface DialogueIdlePauseDecision {
  stopIdleAction: boolean;
}

export interface DialogueIdleResumeDecision {
  restartIdleAction: boolean;
}

/** Tracks only the idle action interrupted by a dialogue session. */
export class DialogueIdleArbiter {
  private restartIdleAfterDialogue = false;

  pause(activeMotionPriority: string | null | undefined): DialogueIdlePauseDecision {
    this.restartIdleAfterDialogue = activeMotionPriority === 'idle';
    return { stopIdleAction: this.restartIdleAfterDialogue };
  }

  resume(): DialogueIdleResumeDecision {
    const restartIdleAction = this.restartIdleAfterDialogue;
    this.restartIdleAfterDialogue = false;
    return { restartIdleAction };
  }
}
