import prisma from '@/app/libs/prisma';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { ApiError } from '@/app/libs/apiError';
import type { Ticket } from '@/app/types/ticket';

export type TicketDetailActor = {
  id_user: number;
  role: string;
};

function normalizeStatus(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

async function canAccessTicket(ticket: {
  teknisi_user_id: number | null;
  workzone: string | null;
}, actor: TicketDetailActor): Promise<boolean> {
  if (actor.role === 'teknisi') {
    return ticket.teknisi_user_id === actor.id_user;
  }

  if (isAdminRole(actor.role)) {
    const workzones = await getWorkzonesForUser(actor.id_user);
    if (workzones.length === 0) return true;

    const wz = String(ticket.workzone || '')
      .trim()
      .toUpperCase();
    if (!wz) return false;

    return workzones.some((w) => {
      const normalized = String(w || '')
        .trim()
        .toUpperCase();
      return normalized && wz === normalized;
    });
  }

  return false;
}

export async function getTicketDetailForActor(
  ticketId: number,
  actor: TicketDetailActor,
): Promise<Ticket | null> {
  const [row, tracking, activityLogs, assignmentHistory] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      include: {
        users: { select: { nama: true } },
      },
    }),
    prisma.ticket_tracking.findFirst({
      where: { ticket_id: ticketId },
      include: {
        assigner: { select: { nama: true } },
        technician: { select: { nama: true } },
      },
    }),
    prisma.ticket_activity_log.findMany({
      where: { ticket_id: ticketId },
      include: {
        user: { select: { nama: true, role_id: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    prisma.ticket_assignment_history.findMany({
      where: { ticket_id: ticketId },
      include: {
        assigner: { select: { nama: true } },
        technician: { select: { nama: true } },
      },
      orderBy: { assigned_at: 'desc' },
      take: 100,
    }),
  ]);

  if (!row) return null;

  const allowed = await canAccessTicket(
    { teknisi_user_id: row.teknisi_user_id, workzone: row.workzone },
    actor,
  );
  if (!allowed) {
    throw new ApiError(403, 'Unauthorized');
  }

  const rawRow = await prisma.ticket_raw.findFirst({
    where: { incident: row.incident },
    select: { reported_by: true },
  });

  return {
    idTicket: row.id_ticket,
    ticket: row.incident,
    summary: row.summary || '',
    reportedDate: row.reported_date || '',
    ownerGroup: row.owner_group,
    serviceType: row.service_type,
    customerType: row.customer_type,
    ctype: row.customer_type || undefined,
    customerSegment: row.customer_segment,
    serviceNo: row.service_no || '',
    contactName: row.contact_name || '',
    reportedBy: rawRow?.reported_by || row.contact_name || null,
    contactPhone: row.contact_phone || '',
    deviceName: row.device_name,
    symptom: row.symptom,
    workzone: row.workzone,
    alamat: row.alamat,
    status: row.status || normalizeStatus(row.status_update) || 'OPEN',
    status_update: row.status_update,
    statusUpdate: row.status_update,
    hasilVisit: row.status_update,
    bookingDate: row.booking_date,
    sourceTicket: row.source_ticket,
    jenisTiket: row.jenis_tiket_2,
    jenisTiket1: row.jenis_tiket_1,
    ticketIdGamas: row.ticket_id_gamas,
    flaggingManja: row.flagging_manja,
    flaggingDatin: row.flagging_datin,
    guaranteeStatus: row.guarantee_status,
    worklogSummary: row.worklog_summary,
    solution: row.solution,
    descriptionActualSolution: row.description_actual_solution,
    sqmUpdateReason: row.sqm_update_reason,
    channel: row.channel,
    witel: row.witel,
    incidentDomain: row.incident_domain,
    customerName: row.customer_name,
    statusDate: row.status_date,
    realm: row.realm,
    snOnt: row.sn_ont,
    tipeOnt: row.tipe_ont,
    onuRx: row.onu_rx,
    rkInformation: row.rk_information,
    classificationFlag: row.classification_flag,
    classificationPath: row.classification_path,
    lapul: row.lapul,
    gaul: row.gaul,
    tscResult: row.tsc_result,
    sccResult: row.scc_result,
    hours: row.hours,
    durasiTicket: row.durasi_ticket,
    jamExpired: row.jam_expired,
    manjaExpired: row.manja_expired,
    statusManja: row.status_manja,
    statusTtr12Gold: row.status_ttr_12_gold,
    statusTtr3Diamond: row.status_ttr_3_diamond,
    statusTtr24Reguler: row.status_ttr_24_reguler,
    statusTtr6Platinum: row.status_ttr_6_platinum,
    statusTtrDatinK1: row.status_ttr_datin_k1,
    statusTtrDatinK2: row.status_ttr_datin_k2,
    statusTtrDatinK3: row.status_ttr_datin_k3,
    statusTtrIndibiz4Jam: row.status_ttr_indibiz_4_jam,
    statusTtrReseller6Jam: row.status_ttr_reseller_6_jam,
    statusTtrWifiId: row.status_ttr_wifi_id,
    maxTtrReguler: row.status_ttr_24_reguler ? row.status_ttr_24_reguler : null,
    maxTtrGold: row.status_ttr_12_gold ? row.status_ttr_12_gold : null,
    maxTtrPlatinum: row.status_ttr_6_platinum ? row.status_ttr_6_platinum : null,
    maxTtrDiamond: row.status_ttr_3_diamond ? row.status_ttr_3_diamond : null,
    pendingDompis: row.pending_dompis,
    rca: row.rca,
    subRca: row.sub_rca,
    descriptionSolutionDompis: row.description_solution_dompis,
    teknisiUserId: row.teknisi_user_id,
    technicianName: row.users?.nama,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    syncDate: row.sync_date ? row.sync_date.toISOString() : null,
    syncedAt: row.synced_at ? row.synced_at.toISOString() : null,
    importBatch: row.import_batch,
    tracking: tracking
      ? {
          assignedAt: tracking.assigned_at?.toISOString() ?? null,
          assignedBy: tracking.assigner?.nama ?? null,
          assignedTo: tracking.technician?.nama ?? null,
          pickedUpAt: tracking.picked_up_at?.toISOString() ?? null,
          onProgressAt: tracking.on_progress_at?.toISOString() ?? null,
          pendingAt: tracking.pending_at?.toISOString() ?? null,
          closedAt: tracking.closed_at?.toISOString() ?? null,
          pendingDompis: tracking.pending_dompis ?? null,
        }
      : null,
    activityLog: activityLogs.map(
      (log: {
        id: number;
        activity_type: string | null;
        description: string | null;
        user: { nama: string | null; role_id: number | null } | null;
        created_at: Date;
      }) => ({
        id: log.id,
        type: log.activity_type,
        description: log.description,
        userName: log.user?.nama ?? null,
        roleId: log.user?.role_id ?? null,
        createdAt: log.created_at.toISOString(),
      }),
    ),
    assignmentHistory: assignmentHistory.map(
      (h: {
        id: number;
        assigner: { nama: string | null } | null;
        technician: { nama: string | null } | null;
        assigned_at: Date;
        unassigned_at: Date | null;
        is_active: boolean;
      }) => ({
        id: h.id,
        assignerName: h.assigner?.nama ?? null,
        technicianName: h.technician?.nama ?? null,
        assignedAt: h.assigned_at.toISOString(),
        unassignedAt: h.unassigned_at?.toISOString() ?? null,
        isActive: h.is_active,
      }),
    ),
  } as Ticket;
}
