'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

function invalidateTicketDashboardQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      (query.queryKey[0] === queryKeys.tickets.all[0] ||
        query.queryKey[0] === queryKeys.dashboard.all[0]),
    refetchType: 'active',
  });
}

export function useAssignTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      teknisiUserId,
    }: {
      ticketId: number | string;
      teknisiUserId: number;
    }) => {
      const res = await fetchWithAuth(
        `/api/tickets/${ticketId}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({ teknisiUserId: Number(teknisiUserId) }),
        },
      );
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to assign');
      return json.data;
    },
    onSuccess: () => {
      invalidateTicketDashboardQueries(queryClient);
    },
  });
}

export function useRemoveClusterAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetchWithAuth(
        `/api/clustering/assign/${assignmentId}`,
        { method: 'DELETE' },
      );
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete assignment');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.assignments() });
    },
  });
}

export function usePlotTeknisi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clusterId,
      teknisiIds,
      assignedDate,
    }: {
      clusterId: number;
      teknisiIds: number[];
      assignedDate: string;
    }) => {
      const res = await fetchWithAuth('/api/clustering/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: clusterId,
          teknisi_ids: teknisiIds,
          assigned_date: assignedDate,
        }),
      });
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to plot');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.assignments() });
    },
  });
}

export function useCopyAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fromDate,
      toDate,
      saId,
    }: {
      fromDate: string;
      toDate: string;
      saId?: number;
    }) => {
      const res = await fetchWithAuth('/api/clustering/assign/copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from_date: fromDate, to_date: toDate, sa_id: saId }),
      });
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to copy');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.assignments() });
    },
  });
}

export function useDeleteCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clusterId: number) => {
      const res = await fetchWithAuth(`/api/clustering/${clusterId}`, {
        method: 'DELETE',
      });
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed to delete cluster');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.lists() });
    },
  });
}

export function useUpdateCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clusterId,
      namaCluster,
      isActive,
    }: {
      clusterId: number;
      namaCluster: string;
      isActive: boolean;
    }) => {
      const res = await fetchWithAuth(`/api/clustering/${clusterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama_cluster: namaCluster, is_active: isActive }),
      });
      const json = await res?.json();
      if (!json?.success) throw new Error(json?.message || 'Failed to update cluster');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.lists() });
    },
  });
}

export function useCreateCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      saId,
      namaCluster,
    }: {
      saId: number;
      namaCluster: string;
    }) => {
      const res = await fetch('/api/clustering', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sa_id: saId, nama_cluster: namaCluster }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create cluster');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.lists() });
    },
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/sync', { method: 'POST' });
      return res?.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status() });
    },
  });
}

export function useRunAutoAssign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/clustering/auto-assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Auto-assign failed');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clustering.assignments() });
    },
  });
}
