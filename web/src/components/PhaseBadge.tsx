const phaseClass: Record<string, string> = {
  Succeeded: 'badge-success',
  Running: 'badge-info',
  Planning: 'badge-info',
  WaitingApproval: 'badge-warning',
  Error: 'badge-error',
  DestroyFailed: 'badge-error',
  Retrying: 'badge-warning',
  Queued: 'badge-muted',
  Suspended: 'badge-muted',
  DriftChecking: 'badge-info',
  ScheduledApply: 'badge-warning',
  Destroying: 'badge-warning',
  PlanRejected: 'badge-muted',
}

export function PhaseBadge({ phase }: { phase: string }) {
  const cls = phaseClass[phase] || 'badge-muted'
  return <span className={`badge ${cls}`}>{phase || 'Unknown'}</span>
}
