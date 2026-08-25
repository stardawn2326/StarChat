export type Live2DSwitchStage = 'preflight' | 'initialize' | 'commit';

export interface Live2DSwitchError {
  stage: Live2DSwitchStage;
  message: string;
  cause?: unknown;
}

export interface Live2DSwitchResult<T> {
  committed: boolean;
  active: T;
  candidate: T;
  error?: Live2DSwitchError;
}

/**
 * Keep the old runtime value authoritative until the candidate has completed
 * initialization. The renderer and the main-process persistence layer use the
 * same boundary so a broken external model cannot blank the current pet.
 */
export async function transactionalModelSwitch<T>(
  active: T,
  candidate: T,
  initialize: (candidate: T) => Promise<T>
): Promise<Live2DSwitchResult<T>> {
  try {
    const initialized = await initialize(candidate);
    return { committed: true, active: initialized, candidate };
  } catch (cause) {
    return {
      committed: false,
      active,
      candidate,
      error: {
        stage: 'initialize',
        message: cause instanceof Error ? cause.message : String(cause),
        cause
      }
    };
  }
}
