import { useState, useEffect, useCallback } from 'react';
import { incidentsApi } from '../services/api';
import { IncidentCard } from '@shared/types';

export function useIncidents(
  filters: { status?: string; severity?: string } = {},
  pageSize = 20,
) {
  const [incidents, setIncidents] = useState<IncidentCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await incidentsApi.list({ ...filters, limit: pageSize, page });
      setIncidents(r.data?.items ?? []);
      setTotal(r.data?.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.severity, page, pageSize]);

  useEffect(() => { fetch(); }, [fetch]);

  const refresh = () => fetch();

  const updateStatus = async (id: string, status: IncidentCard['status']) => {
    await incidentsApi.setStatus(id, status);
    refresh();
  };

  return { incidents, total, page, setPage, loading, error, refresh, updateStatus };
}
