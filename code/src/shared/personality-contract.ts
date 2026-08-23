import { validateRolePackage, type RolePackage } from './role-package';

export interface PersonalityRequestSnapshot {
  readonly capturedAt: number;
  readonly roleId: string;
  readonly displayName: string;
  readonly address: string;
  readonly systemPrompt: string;
  readonly relationshipStages: readonly string[];
  readonly scales: Readonly<RolePackage['personality']['scales']>;
  readonly semanticMappings: Readonly<RolePackage['presentation']['semanticMappings']>;
  readonly modelAsset: string | null;
}

/** Captures an immutable, secret-free role view for exactly one future request. */
export function createPersonalityRequestSnapshot(roleInput: unknown, capturedAt = Date.now()): PersonalityRequestSnapshot {
  const role = validateRolePackage(roleInput);
  return Object.freeze({
    capturedAt,
    roleId: role.id,
    displayName: role.displayName,
    address: role.identity.address,
    systemPrompt: role.personality.systemPrompt,
    relationshipStages: Object.freeze([...role.personality.relationshipStages]),
    scales: Object.freeze({ ...role.personality.scales }),
    semanticMappings: Object.freeze(structuredClone(role.presentation.semanticMappings)),
    modelAsset: role.visual.modelAsset
  });
}
