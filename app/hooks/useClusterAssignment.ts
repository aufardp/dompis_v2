'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Assignment {
  id: number;
  teknisi_id: number;
  teknisi_nama: string;
  teknisi_nik: string;
  assigned_date: string;
  note: string | null;
}

interface ClusterAssignment {
  cluster_id: number;
  cluster_name: string;
  assignments: Assignment[];
}

export function useClusterAssignment(date?: string, saId?: number) {
  const [data, setData] = useState<ClusterAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (saId) params.set('sa_id', String(saId));

      const url = `/api/clustering/assign${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      if (!res) {
        setError('Failed to fetch assignments');
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to fetch assignments');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [date, saId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const plotTeknisi = useCallback(
    async (clusterId: number, teknisiId: number, note?: string) => {
      const res = await fetchWithAuth('/api/clustering/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: clusterId,
          teknisi_id: teknisiId,
          assigned_date: date || new Date().toISOString().split('T')[0],
          note,
        }),
      });

      if (!res) {
        throw new Error('Failed to plot teknisi');
      }

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.message || 'Failed to plot teknisi');
      }

      await fetchAssignments();
      return json.data;
    },
    [date, fetchAssignments],
  );

  const removeAssignment = useCallback(
    async (assignmentId: number) => {
      const res = await fetchWithAuth(`/api/clustering/assign/${assignmentId}`, {
        method: 'DELETE',
      });

      if (!res) {
        throw new Error('Failed to delete assignment');
      }

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.message || 'Failed to delete assignment');
      }

      await fetchAssignments();
    },
    [fetchAssignments],
  );

  const copyFromDate = useCallback(
    async (fromDate: string, toDate: string) => {
      const res = await fetchWithAuth('/api/clustering/assign/copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from_date: fromDate,
          to_date: toDate,
          sa_id: saId,
        }),
      });

      if (!res) {
        throw new Error('Failed to copy assignments');
      }

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.message || 'Failed to copy assignments');
      }

      await fetchAssignments();
      return json.data;
    },
    [saId, fetchAssignments],
  );

  return {
    assignments: data,
    loading,
    error,
    refresh: fetchAssignments,
    plotTeknisi,
    removeAssignment,
    copyFromDate,
  };
}
