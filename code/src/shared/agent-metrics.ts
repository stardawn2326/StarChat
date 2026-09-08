export interface AgentTaskMetrics {
  toolCalls: number;
  readFileCalls: number;
  searchCalls: number;
  writeCalls: number;
  verificationRuns: number;
  contextCompactions: number;
}

export const EMPTY_AGENT_TASK_METRICS: Readonly<AgentTaskMetrics> = Object.freeze({
  toolCalls: 0,
  readFileCalls: 0,
  searchCalls: 0,
  writeCalls: 0,
  verificationRuns: 0,
  contextCompactions: 0
});

export function cloneAgentTaskMetrics(metrics: AgentTaskMetrics = EMPTY_AGENT_TASK_METRICS): AgentTaskMetrics {
  return {
    toolCalls: Math.max(0, Math.floor(metrics.toolCalls)),
    readFileCalls: Math.max(0, Math.floor(metrics.readFileCalls)),
    searchCalls: Math.max(0, Math.floor(metrics.searchCalls)),
    writeCalls: Math.max(0, Math.floor(metrics.writeCalls)),
    verificationRuns: Math.max(0, Math.floor(metrics.verificationRuns)),
    contextCompactions: Math.max(0, Math.floor(metrics.contextCompactions))
  };
}

export function incrementAgentTaskMetrics(metrics: AgentTaskMetrics, field: keyof AgentTaskMetrics, amount = 1): AgentTaskMetrics {
  const next = cloneAgentTaskMetrics(metrics);
  next[field] += Math.max(0, Math.floor(amount));
  return next;
}
