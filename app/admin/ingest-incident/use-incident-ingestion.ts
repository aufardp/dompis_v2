'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type BulkIncidentReport } from '@/lib/ingestion/incident-input';
import {
  IncidentRequestError,
  isRequestId,
  requestIncidentReport,
  restoreIncidentSubmission,
  type IncidentSubmission,
} from './request';

const endpoint = '/api/admin/ingest-incidents';
const queryKey = (userId: number, requestId: string) => [
  'incident-ingestion',
  userId,
  requestId,
];
const storageKey = (userId: number) => `dompis:incident-ingestion:${userId}`;
type ActiveRequest = {
  userId: number;
  requestId: string;
  submission?: IncidentSubmission;
};

function remember(userId: number, submission?: IncidentSubmission) {
  try {
    if (submission)
      sessionStorage.setItem(storageKey(userId), JSON.stringify(submission));
    else sessionStorage.removeItem(storageKey(userId));
  } catch {
    /* The URL still allows status recovery when browser storage is unavailable. */
  }
}

function updateUrl(requestId?: string) {
  const url = new URL(window.location.href);
  if (requestId) url.searchParams.set('requestId', requestId);
  else url.searchParams.delete('requestId');
  window.history.replaceState(null, '', url);
}

export function useIncidentIngestion(userId?: number) {
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [active, setActive] = useState<ActiveRequest>();
  const [readyOwner, setReadyOwner] = useState<number>();
  const sending = useRef(false);
  const current = active?.userId === userId ? active : undefined;

  useEffect(() => {
    if (!userId) return;
    let saved: IncidentSubmission | null = null;
    try {
      saved = restoreIncidentSubmission(
        sessionStorage.getItem(storageKey(userId)),
      );
    } catch {}
    const requestedId = new URL(window.location.href).searchParams.get(
      'requestId',
    );
    const requestId =
      requestedId && isRequestId(requestedId) ? requestedId : saved?.requestId;
    const submission =
      saved?.requestId === requestId ? (saved ?? undefined) : undefined;
    setActive(requestId ? { userId, requestId, submission } : undefined);
    setInput(submission?.incidents.join('\n') ?? '');
    setReadyOwner(userId);
  }, [userId]);

  const mutation = useMutation({
    mutationFn: (value: ActiveRequest & { submission: IncidentSubmission }) =>
      requestIncidentReport(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value.submission),
      }),
    onSuccess: (report, value) =>
      client.setQueryData(queryKey(value.userId, value.requestId), report),
  });

  const status = useQuery<BulkIncidentReport, Error>({
    queryKey: queryKey(userId ?? 0, current?.requestId ?? ''),
    queryFn: ({ signal }) =>
      requestIncidentReport(
        `${endpoint}?requestId=${encodeURIComponent(current!.requestId)}`,
        { signal },
      ),
    enabled: !!current && !mutation.isPending,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.terminal ||
      (query.state.error instanceof IncidentRequestError &&
        query.state.error.status === 404)
        ? false
        : 5000,
    refetchIntervalInBackground: false,
  });

  async function send(incidents: string[], resume = false) {
    if (!userId || readyOwner !== userId || sending.current) return;
    sending.current = true;
    const submission =
      resume && current
        ? (current.submission ?? {
            requestId: current.requestId,
            incidents,
            savedAt: Date.now(),
          })
        : { requestId: crypto.randomUUID(), incidents, savedAt: Date.now() };
    const value = { userId, requestId: submission.requestId, submission };
    setActive(value);
    setInput(submission.incidents.join('\n'));
    remember(userId, submission);
    updateUrl(submission.requestId);
    try {
      await mutation.mutateAsync(value);
    } catch {
      /* Keep the same submission available when the server response is uncertain. */
    } finally {
      sending.current = false;
    }
  }

  const report = status.data;
  const mutationError =
    mutation.variables?.userId === userId &&
    mutation.variables?.requestId === current?.requestId
      ? mutation.error
      : null;
  const expired =
    status.error instanceof IncidentRequestError && status.error.status === 404;
  return {
    input,
    setInput,
    report,
    requestId: current?.requestId,
    ready: !!userId && readyOwner === userId,
    submitting: mutation.isPending,
    fetching: status.isFetching,
    error: mutationError ?? status.error,
    canStart:
      !current || !!report?.terminal || (expired && !current.submission),
    canResume:
      !!current &&
      !report?.terminal &&
      (!!current.submission || !!report?.pendingEnqueue),
    send,
    resume: () =>
      send(
        current?.submission?.incidents ??
          report?.items.map((item) => item.incident) ??
          [],
        true,
      ),
    retryFailed: () =>
      send(
        report?.items
          .filter((item) => item.terminal && !item.success)
          .map((item) => item.incident) ?? [],
      ),
    refresh: () => {
      mutation.reset();
      void status.refetch();
    },
    reset: () => {
      if (!userId) return;
      remember(userId);
      updateUrl();
      setActive(undefined);
      setInput('');
      mutation.reset();
    },
  };
}
