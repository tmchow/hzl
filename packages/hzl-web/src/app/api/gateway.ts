import type {
  CronJob,
  CronStatus,
  GatewayAgent,
  GatewayStatus,
  CronJobCreateParams,
  CronJobUpdatePatch,
} from './types';

async function postJson<T>(path: string, body?: object): Promise<T> {
  const url = new URL(path, window.location.origin);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const url = new URL(path, window.location.origin);
  const response = await fetch(url.toString());

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function fetchGatewayStatus(): Promise<{ status: GatewayStatus }> {
  return getJson('/api/gateway/status');
}

export async function configureGateway(url: string, token?: string): Promise<{ status: GatewayStatus }> {
  return postJson('/api/gateway/config', { url, token });
}

export async function fetchGatewayAgents(): Promise<{ agents: GatewayAgent[] }> {
  return postJson('/api/gateway/agents');
}

export async function fetchCronJobs(): Promise<{ jobs: CronJob[] }> {
  return postJson('/api/gateway/cron/list', { includeDisabled: true });
}

export async function createCronJob(params: CronJobCreateParams): Promise<{ job: CronJob }> {
  return postJson('/api/gateway/cron/add', params);
}

export async function updateCronJob(jobId: string, patch: CronJobUpdatePatch): Promise<{ job: CronJob }> {
  return postJson('/api/gateway/cron/update', { id: jobId, patch });
}

export async function removeCronJob(jobId: string): Promise<void> {
  await postJson('/api/gateway/cron/remove', { id: jobId });
}

export async function runCronJob(jobId: string, mode = 'force'): Promise<unknown> {
  return postJson('/api/gateway/cron/run', { id: jobId, mode });
}

export async function fetchCronStatus(): Promise<CronStatus> {
  return getJson('/api/gateway/cron/status');
}
