export const TICKET_EXPORT_COLUMNS: string[] = [
  'Ticket',
  'Summary',
  'Reported Date',
  'Owner Group',
  'Customer Segment',
  'Service Type',
  'Witel',
  'Workzone',
  'Status',
  'Status Date',
  'Ticket ID Gamas',
  'Contact Phone',
  'Contact Name',
  'Booking Date',
  'Source Ticket',
  'Channel',
  'Customer Type',
  'Customer Name',
  'Service No',
  'Incident Domain',
  'Symptom',
  'Solution',
  'Description Actual Solution',
  'Description Solution Dompis',
  'Device Name',
  'Worklog Summary',
  'Classification Flag',
  'Realm',
  'TSC Result',
  'SCC Result',
  'SN ONT',
  'Tipe ONT',
  'RK Information',
  'Classification Path',
  'LAPUL',
  'GAUL',
  'ONU RX',
  'Pending Reason',
  'Guarantee Status',
  'Status Insera',
  'Status Dompis',
  'Jenis Tiket 1',
  'Jenis Tiket 2',
  'Address',
  'Flagging Manja',
  'Flagging',
  'Pending Dompis',
  'SQM Update Reason',
  'RCA',
  'Sub RCA',
  'Technician',
  'Technician User ID',
  'Closed At',
  'Age / SLA',
];

/**
 * Every column read by `buildTicketExportRow`. Used by the Semesta export so
 * its download carries the same fields as the daily export.
 */
export const TICKET_EXPORT_SELECT = {
  id_ticket: true,
  incident: true,
  summary: true,
  reported_date: true,
  owner_group: true,
  customer_segment: true,
  service_type: true,
  witel: true,
  workzone: true,
  status: true,
  status_date: true,
  ticket_id_gamas: true,
  contact_phone: true,
  contact_name: true,
  booking_date: true,
  source_ticket: true,
  channel: true,
  customer_type: true,
  customer_name: true,
  service_no: true,
  incident_domain: true,
  symptom: true,
  solution: true,
  description_actual_solution: true,
  description_solution_dompis: true,
  device_name: true,
  worklog_summary: true,
  classification_flag: true,
  realm: true,
  tsc_result: true,
  scc_result: true,
  sn_ont: true,
  tipe_ont: true,
  rk_information: true,
  classification_path: true,
  lapul: true,
  gaul: true,
  onu_rx: true,
  pending_reason: true,
  guarantee_status: true,
  status_update: true,
  jenis_tiket_1: true,
  jenis_tiket_2: true,
  alamat: true,
  flagging_manja: true,
  pending_dompis: true,
  sqm_update_reason: true,
  rca: true,
  sub_rca: true,
  teknisi_user_id: true,
  closed_at: true,
  ttr_comply_status: true,
  users: { select: { nama: true } },
} as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function getTicketStatusLabel(raw: string | null | undefined): string {
  if (!raw) return 'Open';
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    open: 'Open',
    assigned: 'Assigned',
    on_progress: 'On Progress',
    pending: 'Pending',
    escalated: 'Escalated',
    cancelled: 'Cancelled',
    close: 'Close',
    closed: 'Closed',
  };
  return map[v] ?? raw;
}

function getFlaggingLabel(ticket: {
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
  ticketIdGamas?: string | null;
}): string {
  const { flaggingManja, guaranteeStatus, ticketIdGamas } = ticket;

  if (flaggingManja === 'P1') return 'P1';
  if (flaggingManja === 'P+') return 'P+';
  if (flaggingManja === 'EXPIRED') return 'EXPIRED';

  const gs = (guaranteeStatus ?? '').trim().toLowerCase();
  if (gs === 'guarantee') return 'FFG';

  const gamasRaw = ticketIdGamas ?? ticket.ticketIdGamas ?? null;
  const gamas = String(gamasRaw ?? '').trim();
  const invalidGamas = ['-', '--', 'null', 'undefined', 'n/a', 'na', ''];
  if (gamas && !invalidGamas.includes(gamas.toLowerCase())) {
    return 'GAMAS';
  }

  return '';
}

function computeAge(reportedDate: string | null | undefined): string {
  if (!reportedDate) return '';
  try {
    const d = new Date(reportedDate);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    if (diffDays > 0) {
      return `${diffDays}d ${remainingHours}h`;
    }
    return `${diffHours}h`;
  } catch {
    return '';
  }
}

export function buildTicketExportRow(ticket: any): Array<string | number> {
  const jenisRaw = ticket.jenisTiket ?? ticket.jenis_tiket_2 ?? '';
  return [
    ticket.ticket ?? ticket.incident ?? '',
    ticket.summary ?? '',
    formatDateTime(ticket.reportedDate ?? ticket.reported_date),
    ticket.ownerGroup ?? ticket.owner_group ?? '',
    ticket.customerSegment ?? ticket.customer_segment ?? '',
    ticket.serviceType ?? ticket.service_type ?? '',
    ticket.witel ?? '',
    ticket.workzone ?? '',
    getTicketStatusLabel(ticket.status ?? ticket.statusInsera),
    formatDateTime(ticket.statusDate ?? ticket.status_date),
    ticket.ticketIdGamas ?? ticket.ticket_id_gamas ?? '',
    ticket.contactPhone ?? ticket.contact_phone ?? '',
    ticket.contactName ?? ticket.contact_name ?? '',
    formatDate(ticket.bookingDate ?? ticket.booking_date),
    ticket.sourceTicket ?? ticket.source_ticket ?? '',
    ticket.channel ?? '',
    ticket.ctype ?? ticket.customerType ?? ticket.customer_type ?? '',
    ticket.customerName ?? ticket.customer_name ?? '',
    ticket.serviceNo ?? ticket.service_no ?? '',
    ticket.incidentDomain ?? ticket.incident_domain ?? '',
    ticket.symptom ?? '',
    ticket.solution ?? '',
    ticket.descriptionActualSolution ?? ticket.description_actual_solution ?? '',
    ticket.descriptionSolutionDompis ?? ticket.description_solution_dompis ?? '',
    ticket.deviceName ?? ticket.device_name ?? '',
    ticket.worklogSummary ?? ticket.worklog_summary ?? '',
    ticket.classificationFlag ?? ticket.classification_flag ?? '',
    ticket.realm ?? '',
    ticket.tscResult ?? ticket.tsc_result ?? '',
    ticket.sccResult ?? ticket.scc_result ?? '',
    ticket.snOnt ?? ticket.sn_ont ?? '',
    ticket.tipeOnt ?? ticket.tipe_ont ?? '',
    ticket.rkInformation ?? ticket.rk_information ?? '',
    ticket.classificationPath ?? ticket.classification_path ?? '',
    ticket.lapul ?? '',
    ticket.gaul ?? '',
    ticket.onuRx ?? ticket.onu_rx ?? '',
    ticket.pendingReason ?? ticket.pending_reason ?? '',
    ticket.guaranteeStatus ?? ticket.guarantee_status ?? '',
    getTicketStatusLabel(ticket.status ?? ticket.statusInsera),
    getTicketStatusLabel(ticket.status_update ?? ticket.statusUpdate),
    ticket.jenisTiket1 ?? ticket.jenis_tiket_1 ?? '',
    jenisRaw,
    ticket.alamat ?? '',
    ticket.flaggingManja ?? ticket.flagging_manja ?? '',
    getFlaggingLabel(ticket),
    ticket.pendingDompis ?? ticket.pending_dompis ?? '',
    ticket.sqmUpdateReason ?? ticket.sqm_update_reason ?? '',
    ticket.rca ?? '',
    ticket.subRca ?? ticket.sub_rca ?? '',
    ticket.technicianName ?? ticket.users?.nama ?? '',
    ticket.teknisiUserId ?? ticket.teknisi_user_id ?? '',
    formatDateTime(ticket.closedAt ?? ticket.closed_at),
    computeAge(ticket.reportedDate ?? ticket.reported_date),
  ];
}
