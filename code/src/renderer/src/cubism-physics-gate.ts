export interface PhysicsRuntimeHost {
  physics?: {
    evaluate: (coreModel: unknown, deltaSeconds: number) => void;
    __starchatPhysicsGateInstalled?: boolean;
    __starchatPhysicsEnabled?: boolean;
  };
  setPhysicsEnabled?: (enabled: boolean) => void;
  __starchatPhysicsGateInstalled?: boolean;
}

export function installPhysicsGate(internalModel: PhysicsRuntimeHost | null | undefined): void {
  const physics = internalModel?.physics;
  if (!internalModel || !physics || physics.__starchatPhysicsGateInstalled || typeof physics.evaluate !== 'function') return;
  const originalEvaluate = physics.evaluate.bind(physics);
  physics.__starchatPhysicsEnabled = true;
  physics.evaluate = (coreModel, deltaSeconds) => {
    if (physics.__starchatPhysicsEnabled !== false) originalEvaluate(coreModel, deltaSeconds);
  };
  internalModel.setPhysicsEnabled = (enabled) => {
    physics.__starchatPhysicsEnabled = enabled !== false;
  };
  physics.__starchatPhysicsGateInstalled = true;
  internalModel.__starchatPhysicsGateInstalled = true;
}
