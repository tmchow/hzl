import { useCallback, useEffect, useState } from 'react';
import {
  fetchCronJobs,
  fetchCronStatus,
  updateCronJob as updateCronJobApi,
  removeCronJob as removeCronJobApi,
  runCronJob as runCronJobApi,
  createCronJob as createCronJobApi,
} from '../api/gateway';
import type { CronJob, CronStatus, CronJobCreateParams, CronJobUpdatePatch } from '../api/types';

export interface UseCronJobsResult {
  allJobs: CronJob[];
  loading: boolean;
  error: string | null;
  cronStatus: CronStatus | null;
  refresh: () => void;
  toggleJob: (jobId: string, enabled: boolean) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  runJob: (jobId: string) => Promise<unknown>;
  createJob: (params: CronJobCreateParams) => Promise<CronJob>;
  updateJob: (jobId: string, patch: CronJobUpdatePatch) => Promise<CronJob>;
}

/**
 * Fetch all cron jobs from the gateway. Returns the full unfiltered list;
 * callers filter by agent as needed.
 */
export function useCronJobs(gatewayConnected: boolean): UseCronJobsResult {
  const [allJobs, setAllJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);

  const refresh = useCallback(() => {
    if (!gatewayConnected) return;

    setLoading(true);
    setError(null);

    Promise.all([fetchCronJobs(), fetchCronStatus()])
      .then(([jobsData, statusData]: [{ jobs: CronJob[] }, CronStatus]) => {
        setAllJobs(jobsData.jobs);
        setCronStatus(statusData);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [gatewayConnected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleJob = useCallback(async (jobId: string, enabled: boolean) => {
    await updateCronJobApi(jobId, { enabled });
    refresh();
  }, [refresh]);

  const deleteJob = useCallback(async (jobId: string) => {
    await removeCronJobApi(jobId);
    refresh();
  }, [refresh]);

  const runJob = useCallback(async (jobId: string) => {
    const result = await runCronJobApi(jobId);
    refresh();
    return result;
  }, [refresh]);

  const createJob = useCallback(async (params: CronJobCreateParams) => {
    const result = await createCronJobApi(params);
    refresh();
    return result.job;
  }, [refresh]);

  const updateJob = useCallback(async (jobId: string, patch: CronJobUpdatePatch) => {
    const result = await updateCronJobApi(jobId, patch);
    refresh();
    return result.job;
  }, [refresh]);

  return { allJobs, loading, error, cronStatus, refresh, toggleJob, deleteJob, runJob, createJob, updateJob };
}

/**
 * Filter cron jobs for a specific agent.
 * A job belongs to an agent if agentId matches, or if sessionTarget is 'main'
 * and the agent is 'main' (no explicit agentId).
 */
export function filterJobsForAgent(jobs: CronJob[], agentId: string): CronJob[] {
  return jobs.filter((job) =>
    job.agentId === agentId ||
    (!job.agentId && job.sessionTarget === 'main' && agentId === 'main')
  );
}

/**
 * Normalize an agent ID for matching: lowercase, strip emoji and non-alphanumeric
 * (keeping hyphens and underscores).
 */
export function normalizeAgentId(id: string): string {
  return id
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .trim();
}
