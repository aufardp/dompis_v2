import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { AlertTicketService } from '@/app/libs/services/alert-ticket.service';

export const dynamic = 'force-dynamic';

type TopbarInboxItem = {
  id: string;
  notificationKey: string;
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

type TopbarDiamondAlertItem = {
  id: string;
  notificationKey: string;
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

function toIsoString(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function buildAgeLabel(reportedAtIso: string): string {
  if (!reportedAtIso) return '';
  const reportedAt = new Date(reportedAtIso);
  if (Number.isNaN(reportedAt.getTime())) return '';
  const diffMs = Math.max(0, Date.now() - reportedAt.getTime());
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function buildTargetPath(
  ticketCode: string,
  options?: {
    ticketId?: number;
    tab?: 'semua' | 'b2c' | 'b2b' | 'validasi' | 'unspecOhi';
  },
): string {
  const safeCode = encodeURIComponent(ticketCode);
  const params = new URLSearchParams({
    search: safeCode,
    searchType: 'ticket_code',
  });

  if (Number.isFinite(options?.ticketId ?? NaN) && (options?.ticketId ?? 0) > 0) {
    params.set('ticketId', String(options?.ticketId));
  }

  if (options?.tab) {
    params.set('tab', options.tab);
  }

  return `/admin/ticket-management/kpi-customer?${params.toString()}`;
}

function buildNotificationKey(scope: 'inbox' | 'diamond', ticketCode: string) {
  return `${scope}:${ticketCode}`;
}

function buildDiamondReason(params: {
  status: string;
  statusUpdate: string | null;
  workzone: string | null;
  ageLabel: string;
  contactName: string | null;
  serviceNo: string | null;
}) {
  const parts: string[] = [];
  const normalizedStatus = params.status.trim().toLowerCase();

  if (normalizedStatus === 'assigned') {
    parts.push('Sudah assigned');
  } else if (normalizedStatus === 'open') {
    parts.push('Masih open');
  } else if (normalizedStatus) {
    parts.push(`Status ${normalizedStatus}`);
  }

  if (params.statusUpdate) {
    parts.push(`Update ${params.statusUpdate}`);
  }

  if (params.workzone) {
    parts.push(`Workzone ${params.workzone}`);
  }

  if (params.ageLabel) {
    parts.push(`Umur ${params.ageLabel}`);
  }

  const identity = [params.contactName, params.serviceNo].filter(Boolean).join(' / ');
  if (identity) {
    parts.push(identity);
  }

  return parts.length > 0
    ? parts.join(' · ')
    : 'Diamond ticket perlu perhatian';
}

function mapInboxItem(row: Record<string, any>): TopbarInboxItem | null {
  const ticketCode = String(row.ticket || row.incident || '').trim();
  if (!ticketCode) return null;
  const reportedAt = toIsoString(row.reportedDate || row.reported_date);
  const summary = String(row.summary || row.description || ticketCode || '').trim();
  const status = String(row.status || '').trim().toUpperCase();
  const statusUpdate = String(row.status_update || '').trim().toLowerCase() || null;
  const priority = status === 'CLOSE'
    ? 'normal'
    : statusUpdate === 'assigned'
      ? 'warning'
      : 'high';

  return {
    id: `inbox:${row.idTicket ?? row.id_ticket ?? ticketCode}`,
    notificationKey: buildNotificationKey('inbox', ticketCode),
    ticketCode,
    bucket: 'kpi_customer',
    bucketLabel: 'Customer',
    source: 'CUSTOMER',
    summary: summary || 'Ticket baru Customer',
    reportedAt,
    isRead: false,
    priority,
    targetPath: buildTargetPath(ticketCode, {
      ticketId: Number(row.idTicket ?? row.id_ticket ?? 0) || undefined,
    }),
    customerName: row.contactName || row.contact_name || undefined,
    serviceNo: row.serviceNo || row.service_no || undefined,
    workzone: row.workzone ?? null,
    status: row.status ?? null,
    statusUpdate,
    ageLabel: buildAgeLabel(reportedAt),
  };
}

function mapDiamondItem(row: Record<string, any>): TopbarDiamondAlertItem | null {
  const ticketCode = String(row.ticketId || row.incident || '').trim();
  if (!ticketCode) return null;
  const reportedAt = toIsoString(row.reportedAt || row.reported_date);
  const status = String(row.status || '').trim().toLowerCase();
  const statusUpdate = String(row.status_update || row.statusUpdate || '').trim().toLowerCase() || null;
  const severity = status === 'assigned'
    ? 'warning'
    : status === 'open'
      ? 'high'
      : 'critical';
  const ageLabel = buildAgeLabel(reportedAt);
  const contactName = row.contactName || row.contact_name || null;
  const serviceNo = row.serviceNo || row.service_no || null;
  const workzone = row.workzone ?? null;

  return {
    id: `diamond:${row.idTicket ?? row.id_ticket ?? ticketCode}`,
    notificationKey: buildNotificationKey('diamond', ticketCode),
    ticketCode,
    bucket: 'kpi_customer',
    bucketLabel: 'Customer',
    title: 'Diamond alert',
    summary:
      String(row.summary || row.contactName || row.contact_name || ticketCode).trim() ||
      'Diamond ticket perlu perhatian',
    reportedAt,
    isRead: false,
    severity,
    reason: buildDiamondReason({
      status,
      statusUpdate,
      workzone,
      ageLabel,
      contactName,
      serviceNo,
    }),
    targetPath: buildTargetPath(ticketCode, {
      ticketId: Number(row.idTicket ?? row.id_ticket ?? 0) || undefined,
      tab: 'semua',
    }),
    customerName: contactName || undefined,
    serviceNo: serviceNo || undefined,
    workzone,
    status: row.status ?? null,
    statusUpdate,
    ageLabel,
  };
}

function severityRank(severity: TopbarDiamondAlertItem['severity']): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'warning':
    default:
      return 2;
  }
}

function stripNotificationKey<T extends { notificationKey: string }>(item: T) {
  // The key is only used for persistence lookup.
  const { notificationKey, ...rest } = item;
  return rest;
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'notifications-topbar',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
      'helpdesk',
    ]);

    const { searchParams } = new URL(request.url);
    const workzone = searchParams.get('workzone') || undefined;

    const [dailyResult, diamondRows] = await Promise.all([
      DailyTicketService.getDailyTicketTable(user.role, user.id_user, {
        operationalBucket: ['kpi_customer'],
        workzone,
        ticketStatus: ['OPEN'],
        page: 1,
        limit: 8,
        sort: 'desc',
        includeSummary: false,
        includeOptions: false,
        includeValidasi: false,
      }),
      AlertTicketService.getAlertDiamondTickets(
        user.role,
        user.id_user,
        workzone,
        { limit: 8, includeAssigned: true },
      ),
    ]);

    const inboxItems = (dailyResult.data ?? [])
      .map((row) => mapInboxItem(row as Record<string, any>))
      .filter((item): item is TopbarInboxItem => item !== null);

    const diamondAlerts = (diamondRows ?? [])
      .map((row) => mapDiamondItem(row as Record<string, any>))
      .filter((item): item is TopbarDiamondAlertItem => item !== null);

    diamondAlerts.sort((a, b) => {
      const severityDiff = severityRank(a.severity) - severityRank(b.severity);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });

    const notificationKeys = [
      ...inboxItems.map((item) => item.notificationKey),
      ...diamondAlerts.map((item) => item.notificationKey),
    ];
    const readStates = notificationKeys.length
      ? await prisma.topbar_notification_state.findMany({
          take: 50,
          where: {
            user_id: user.id_user,
            notification_key: { in: notificationKeys },
          },
          select: {
            scope: true,
            notification_key: true,
            is_read: true,
          },
        })
      : [];
    const readKeySet = new Set(
      readStates
        .filter((state) => state.is_read)
        .map((state) => `${state.scope}:${state.notification_key}`),
    );

    const inboxResponseItems = inboxItems.map((item) => ({
      ...stripNotificationKey(item),
      isRead: readKeySet.has(item.notificationKey),
    }));
    const diamondResponseItems = diamondAlerts.map((item) => ({
      ...stripNotificationKey(item),
      isRead: readKeySet.has(item.notificationKey),
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          inbox: {
            items: inboxResponseItems,
            unreadCount: inboxResponseItems.filter((item) => !item.isRead).length,
          },
          diamondAlerts: {
            items: diamondResponseItems,
            unreadCount: diamondResponseItems.filter((item) => !item.isRead).length,
          },
          counts: {
            totalUnread:
              inboxResponseItems.filter((item) => !item.isRead).length +
              diamondResponseItems.filter((item) => !item.isRead).length,
            inboxUnread: inboxResponseItems.filter((item) => !item.isRead).length,
            diamondUnread: diamondResponseItems.filter((item) => !item.isRead).length,
          },
          meta: {
            generatedAt: new Date().toISOString(),
            cacheTtlSeconds: 30,
          },
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching topbar notifications'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
