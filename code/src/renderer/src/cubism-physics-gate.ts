export interface PhysicsRuntimeHost {
  physics?: {
    evaluate: (coreModel: unknown, deltaSeconds: number) => void;
    __baoyinPhysicsGateInstalled?: boolean;
    __baoyinPhysicsEnabled?: boolean;
  };
  setPhysicsEnabled?: (enabled: boolean) => void;
  __baoyinPhysicsGateInstalled?: boolean;
}

export function installPhysicsGate(internalModel: PhysicsRuntimeHost | null | undefined): void {
  const physics = internalModel?.physics;
  if (!internalModel || !physics || physics.__baoyinPhysicsGateInstalled || typeof physics.evaluate !== 'function') return;
  const originalEvaluate = physics.evaluate.bind(physics);
  physics.__baoyinPhysicsEnabled = true;
  physics.evaluate = (coreModel, deltaSeconds) => {
    if (physics.__baoyinPhysicsEnabled !== false) originalEvaluate(coreModel, deltaSeconds);
  };
  internalModel.setPhysicsEnabled = (enabled) => {
    physics.__baoyinPhysicsEnabled = enabled !== false;
  };
  physics.__baoyinPhysicsGateInstalled = true;
  internalModel.__baoyinPhysicsGateInstalled = true;
}
