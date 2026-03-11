import { useCallback, useEffect, useState } from 'react';
import { fetchGatewayStatus, configureGateway as configureGatewayApi, fetchGatewayAgents } from '../api/gateway';
import type { GatewayStatus, GatewayAgent } from '../api/types';

export interface UseGatewayResult {
  status: GatewayStatus;
  loading: boolean;
  error: string | null;
  gatewayAgents: GatewayAgent[];
  configureGateway: (url: string, token?: string) => Promise<void>;
  refresh: () => void;
}

export function useGateway(): UseGatewayResult {
  const [status, setStatus] = useState<GatewayStatus>('unconfigured');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gatewayAgents, setGatewayAgents] = useState<GatewayAgent[]>([]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchGatewayStatus()
      .then((data) => {
        setStatus(data.status);
        setError(null);

        // Fetch agents when connected
        if (data.status === 'connected') {
          fetchGatewayAgents()
            .then((agentsData) => {
              setGatewayAgents(agentsData.agents ?? []);
            })
            .catch(() => {
              // Non-fatal: agents list unavailable
              setGatewayAgents([]);
            });
        } else {
          setGatewayAgents([]);
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        setGatewayAgents([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const configureGateway = useCallback(async (url: string, token?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await configureGatewayApi(url, token);
      setStatus(data.status);

      // Fetch agents after successful connect
      if (data.status === 'connected') {
        try {
          const agentsData = await fetchGatewayAgents();
          setGatewayAgents(agentsData.agents ?? []);
        } catch {
          setGatewayAgents([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, error, gatewayAgents, configureGateway, refresh };
}
