'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

export type TopbarInboxItem = {
  kind: 'inbox';
  id: string;
  ticketCode: string;
  bucket: 'kpi_customer';
  bucketLabel: 'Customer';
  source: 'CUSTOMER';
  summary: string;
  reportedAt: string;
  isRead: boolean;
  priority: 'normal' | 'warning' | 'high';
  targetPath: string;
  customerName?: string;
  serviceNo?: string;
  workzone?: string | null;
  status?: string | null;
  statusUpdate?: string | null;
  ageLabel?: string;
};

export type TopbarDiamondAlertItem = {
  kind: 'diamond';
  id: string;
  ticketCode: string;
  bucket: 'kpi_customer';
  bucketLabel: 'Customer';
  title: string;
  summary: string;
  reportedAt: string;
  isRead: boolean;
  severity: 'warning' | 'high' | 'critical';
  reason: string;
  targetPath: string;
  customerName?: string;
  serviceNo?: string;
  workzone?: string | null;
  status?: string | null;
  statusUpdate?: string | null;
  ageLabel?: string;
};

type NotificationScope = 'inbox' | 'diamond';

type TopbarNotificationsResponse = {
  inbox?: {
    items?: Array<Omit<TopbarInboxItem, 'kind'>>;
    unreadCount?: number;
  };
  diamondAlerts?: {
    items?: Array<Omit<TopbarDiamondAlertItem, 'kind'>>;
    unreadCount?: number;
  };
  counts?: {
    totalUnread?: number;
    inboxUnread?: number;
    diamondUnread?: number;
  };
  meta?: {
    generatedAt?: string;
    cacheTtlSeconds?: number;
  };
};

function patchReadState(
  response: TopbarNotificationsResponse | undefined,
  scope: NotificationScope | 'all',
  ticketCode?: string,
) {
  if (!response) return response;

  const patchItem = <T extends { ticketCode: string; isRead: boolean }>(
    scopeToPatch: NotificationScope,
    items?: T[],
  ) =>
    (items ?? []).map((item) =>
      scope === 'all' || scope === scopeToPatch
        ? !ticketCode || item.ticketCode === ticketCode
          ? { ...item, isRead: true }
          : item
        : item,
    );

  const inboxItems = patchItem('inbox', response.inbox?.items);
  const diamondItems = patchItem('diamond', response.diamondAlerts?.items);

  const inboxUnread = inboxItems.filter((item) => !item.isRead).length;
  const diamondUnread = diamondItems.filter((item) => !item.isRead).length;

  return {
    ...response,
    inbox: {
      items: inboxItems,
      unreadCount: inboxUnread,
    },
    diamondAlerts: {
      items: diamondItems,
      unreadCount: diamondUnread,
    },
    counts: {
      totalUnread: inboxUnread + diamondUnread,
      inboxUnread,
      diamondUnread,
    },
  };
}

export function useTopbarNotifications(workzone?: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.notifications.topbar({
    workzone: workzone || 'all',
  });

  const query = useQuery({
    queryKey,
    staleTime: 15_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzone) params.set('workzone', workzone);

      const res = await fetchWithAuth(`/api/notifications/topbar?${params.toString()}`);
      if (!res) throw new Error('No response');

      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; data?: TopbarNotificationsResponse }
        | null;

      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.message || 'Failed to load topbar notifications');
      }

      return json.data;
    },
  });

  const inboxItems = useMemo(
    () =>
      (query.data?.inbox?.items ?? []).map((item) => ({
        ...item,
        kind: 'inbox' as const,
      })),
    [query.data?.inbox?.items],
  );
  const diamondAlerts = useMemo(
    () =>
      (query.data?.diamondAlerts?.items ?? []).map((item) => ({
        ...item,
        kind: 'diamond' as const,
      })),
    [query.data?.diamondAlerts?.items],
  );

  const inboxUnreadCount = query.data?.counts?.inboxUnread ?? 0;
  const diamondUnreadCount = query.data?.counts?.diamondUnread ?? 0;
  const totalUnreadCount = query.data?.counts?.totalUnread ?? 0;
  const diamondCriticalCount = useMemo(
    () =>
      diamondAlerts.filter(
        (item) => item.severity === 'critical',
      ).length,
    [diamondAlerts],
  );

  const persistAndRefresh = useCallback(
    async (scope: NotificationScope | 'all', ticketCode?: string) => {
      queryClient.setQueryData<TopbarNotificationsResponse>(queryKey, (current) =>
        patchReadState(current, scope, ticketCode),
      );
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey],
  );

  const markItemRead = useCallback(
    async (scope: NotificationScope, ticketCode: string) => {
      const res = await fetchWithAuth('/api/notifications/topbar/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, ticketCode }),
      });

      if (!res) throw new Error('No response');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to mark notification as read');
      }

      await persistAndRefresh(scope, ticketCode);
    },
    [persistAndRefresh],
  );

  const markAllRead = useCallback(
    async (scope: NotificationScope | 'all' = 'all') => {
      const items = [
        ...(query.data?.inbox?.items ?? []).map((item) => ({
          scope: 'inbox' as const,
          ticketCode: item.ticketCode,
        })),
        ...(query.data?.diamondAlerts?.items ?? []).map((item) => ({
          scope: 'diamond' as const,
          ticketCode: item.ticketCode,
        })),
      ].filter((item) => scope === 'all' || item.scope === scope);

      const res = await fetchWithAuth('/api/notifications/topbar/read-all', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, items }),
      });

      if (!res) throw new Error('No response');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to mark notifications as read');
      }

      await persistAndRefresh(scope as NotificationScope | 'all');
    },
    [persistAndRefresh, query.data?.diamondAlerts?.items, query.data?.inbox?.items],
  );

  return {
    inboxItems,
    diamondAlerts,
    inboxUnreadCount,
    diamondUnreadCount,
    diamondCriticalCount,
    totalUnreadCount,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: () => {
      query.refetch();
    },
    markItemRead,
    markAllRead,
  };
}
