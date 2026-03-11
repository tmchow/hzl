import { useState, useEffect, useMemo } from 'react';
import { useAgents } from '../../hooks/useAgents';
import { useAgentEvents } from '../../hooks/useAgentEvents';
import { useAgentTasks } from '../../hooks/useAgentTasks';
import { useGateway } from '../../hooks/useGateway';

import { useCronJobs, filterJobsForAgent, normalizeAgentId } from '../../hooks/useCronJobs';
import type { AgentRosterItem } from '../../api/types';
import AgentRoster from './AgentRoster';
import AgentDetail from './AgentDetail';
import './AgentOps.css';

interface AgentOpsViewProps {
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
  since: string;
  project: string;
  refreshKey: number;
  onAgentCounts?: (active: number, idle: number) => void;
  onGatewayStatus?: (status: string) => void;
  onConfigureGateway?: (fn: (url: string, token?: string) => Promise<void>) => void;
  onTaskClick?: (taskId: string) => void;
}

export default function AgentOpsView({
  selectedAgent,
  onSelectAgent,
  since,
  project,
  refreshKey,
  onAgentCounts,
  onGatewayStatus,
  onConfigureGateway,
  onTaskClick,
}: AgentOpsViewProps) {
  // Data fetching — only runs when this component is mounted (agents view active)
  const { agents: taskAgents, loading: agentsLoading, error: agentsError, refresh: refreshAgents } = useAgents({
    since,
    project: project || undefined,
  });

  // Gateway + cron hooks — fetch ALL cron jobs and gateway agents
  const {
    status: gatewayStatus,
    loading: gatewayLoading,
    error: gatewayError,
    gatewayAgents,
    configureGateway,
    refresh: refreshGateway,
  } = useGateway();

  const {
    allJobs: allCronJobs,
    loading: cronJobsLoading,
    error: cronJobsError,
    cronStatus,
    refresh: refreshCronJobs,
    toggleJob: toggleCronJob,
    deleteJob: deleteCronJob,
    runJob: runCronJob,
    createJob: createCronJob,
    updateJob: updateCronJob,
  } = useCronJobs(gatewayStatus === 'connected');

  // SSE-triggered refresh via refreshKey from parent
  useEffect(() => {
    if (refreshKey > 0) {
      refreshAgents();
      refreshGateway();
      refreshCronJobs();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 60-second tick to update duration displays
  const [, setDurationTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDurationTick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Build normalized mapping: canonical gateway ID → task agent ID
  // This lets us use the canonical ID in the roster but the task ID for DB queries
  const canonicalToTaskId = useMemo(() => {
    const map = new Map<string, string>();
    if (gatewayAgents.length === 0) return map;

    for (const ga of gatewayAgents) {
      const normGa = normalizeAgentId(ga.id);
      for (const ta of taskAgents) {
        if (normalizeAgentId(ta.agent) === normGa) {
          map.set(ga.id, ta.agent);
          break;
        }
      }
    }
    return map;
  }, [gatewayAgents, taskAgents]);

  // Merge gateway agents (authoritative) with task agents (data-bearing)
  // When gateway is connected: gateway agents are the primary roster, enriched with task data
  // When disconnected: fall back to task-only agents
  const mergedAgents = useMemo(() => {
    if (gatewayAgents.length === 0) {
      return taskAgents;
    }

    // Index task agents by normalized ID for lookup
    const taskByNormId = new Map<string, AgentRosterItem>();
    for (const ta of taskAgents) {
      taskByNormId.set(normalizeAgentId(ta.agent), ta);
    }

    const merged: AgentRosterItem[] = [];
    const matchedNormIds = new Set<string>();

    // Gateway agents first (canonical, always shown)
    for (const ga of gatewayAgents) {
      const normId = normalizeAgentId(ga.id);
      const taskAgent = taskByNormId.get(normId);
      matchedNormIds.add(normId);

      if (taskAgent) {
        // Merge: canonical ID + task data
        merged.push({ ...taskAgent, agent: ga.id });
      } else {
        // Gateway-only agent (no tasks in HZL)
        merged.push({
          agent: ga.id,
          isActive: false,
          tasks: [],
          lastActivity: new Date().toISOString(),
          taskCounts: { backlog: 0, ready: 0, in_progress: 0, blocked: 0, done: 0 },
        });
      }
    }

    // Append unmatched task agents (reported IDs not matching any gateway agent)
    for (const ta of taskAgents) {
      if (!matchedNormIds.has(normalizeAgentId(ta.agent))) {
        merged.push(ta);
      }
    }

    return merged;
  }, [taskAgents, gatewayAgents]);

  // The agent ID to use for task DB queries (may differ from canonical)
  const taskAgentId = useMemo(() => {
    if (!selectedAgent) return null;
    return canonicalToTaskId.get(selectedAgent) ?? selectedAgent;
  }, [selectedAgent, canonicalToTaskId]);

  // Use task agent ID for task/event queries, canonical ID for cron filtering
  const {
    events: resolvedAgentEvents,
    total: resolvedAgentEventsTotal,
    loading: resolvedAgentEventsLoading,
    loadMore: resolvedLoadMoreAgentEvents,
    refresh: resolvedRefreshAgentEvents,
  } = useAgentEvents(taskAgentId);

  const {
    tasks: resolvedAgentTasks,
    counts: resolvedAgentTaskCounts,
    refresh: resolvedRefreshAgentTasks,
  } = useAgentTasks(taskAgentId);

  // Re-refresh resolved hooks on SSE
  useEffect(() => {
    if (refreshKey > 0) {
      resolvedRefreshAgentEvents();
      resolvedRefreshAgentTasks();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report agent counts to parent for top-bar display
  useEffect(() => {
    if (!onAgentCounts) return;
    const active = mergedAgents.filter((a) => a.isActive).length;
    onAgentCounts(active, mergedAgents.length - active);
  }, [mergedAgents, onAgentCounts]);

  // Report gateway status and configureGateway to parent for top-bar display
  useEffect(() => {
    if (onGatewayStatus) onGatewayStatus(gatewayStatus);
  }, [gatewayStatus, onGatewayStatus]);

  useEffect(() => {
    if (onConfigureGateway) onConfigureGateway(configureGateway);
  }, [configureGateway, onConfigureGateway]);

  const selectedAgentData = useMemo(() => {
    if (!selectedAgent) return null;
    return mergedAgents.find((a) => a.agent === selectedAgent) ?? null;
  }, [mergedAgents, selectedAgent]);

  // Filter cron jobs for the selected agent (using canonical ID)
  const selectedAgentCronJobs = useMemo(() => {
    if (!selectedAgent) return [];
    return filterJobsForAgent(allCronJobs, selectedAgent);
  }, [allCronJobs, selectedAgent]);

  // Determine if the selected agent is a real gateway agent
  const isSelectedAgentGateway = useMemo(() => {
    if (!selectedAgent || gatewayAgents.length === 0) return false;
    const normSelected = normalizeAgentId(selectedAgent);
    return gatewayAgents.some(ga => normalizeAgentId(ga.id) === normSelected);
  }, [selectedAgent, gatewayAgents]);

  return (
    <div className="agent-ops">
      <div className="agent-ops-panels">
        {/* Left panel — agent roster */}
        <div className="agent-ops-roster">
          {agentsError ? (
            <div className="agent-ops-placeholder">
              <span>Failed to load agents</span>
              <span className="agent-ops-placeholder-hint">{agentsError}</span>
            </div>
          ) : agentsLoading && mergedAgents.length === 0 ? (
            <div className="agent-ops-placeholder">
              <span>Loading agents...</span>
            </div>
          ) : (
            <AgentRoster
              agents={mergedAgents}
              selectedAgent={selectedAgent}
              onSelectAgent={onSelectAgent}
            />
          )}
        </div>

        {/* Right panel — agent detail */}
        <div className="agent-ops-detail">
          <AgentDetail
            agent={selectedAgentData}
            events={resolvedAgentEvents}
            total={resolvedAgentEventsTotal}
            onLoadMore={resolvedLoadMoreAgentEvents}
            loading={resolvedAgentEventsLoading}
            agentTasks={resolvedAgentTasks}
            agentTaskCounts={resolvedAgentTaskCounts}
            onTaskClick={onTaskClick}
            gatewayStatus={gatewayStatus}
            gatewayLoading={gatewayLoading}
            gatewayError={gatewayError}
            onConfigureGateway={configureGateway}
            cronJobs={selectedAgentCronJobs}
            cronJobsLoading={cronJobsLoading}
            cronJobsError={cronJobsError}
            cronStatus={cronStatus}
            onToggleCronJob={toggleCronJob}
            onDeleteCronJob={deleteCronJob}
            onRunCronJob={runCronJob}
            onCreateCronJob={createCronJob}
            onUpdateCronJob={updateCronJob}
            onRefreshCronJobs={refreshCronJobs}
            isGatewayAgent={isSelectedAgentGateway}
            gatewayAgents={gatewayAgents}
          />
        </div>
      </div>
    </div>
  );
}
