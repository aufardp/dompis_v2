import { parseWIBDateInput } from '@/app/utils/datetime';

export interface TicketRawField {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'date';
}

export const TICKET_RAW_FIELDS: TicketRawField[] = [
  {
    key: 'incident',
    label: 'Nomor Tiket (Incident)',
    required: true,
    type: 'string',
  },
  { key: 'status', label: 'Status', required: true, type: 'string' },
  {
    key: 'reported_date',
    label: 'Tanggal Lapor',
    required: true,
    type: 'date',
  },
  { key: 'workzone', label: 'Workzone / SA', required: true, type: 'string' },
  {
    key: 'ttr_customer',
    label: 'TTR Customer',
    required: false,
    type: 'string',
  },
  {
    key: 'symptom',
    label: 'Symptom / Gangguan',
    required: false,
    type: 'string',
  },
  {
    key: 'summary',
    label: 'Summary / Deskripsi',
    required: false,
    type: 'string',
  },
  { key: 'owner_group', label: 'Owner Group', required: false, type: 'string' },
  { key: 'owner', label: 'Owner', required: false, type: 'string' },
  { key: 'status_date', label: 'Status Date', required: false, type: 'string' },
  { key: 'reported_by', label: 'Reported By', required: false, type: 'string' },
  {
    key: 'reported_priority',
    label: 'Reported Priority',
    required: false,
    type: 'string',
  },
  { key: 'witel', label: 'Witel', required: false, type: 'string' },
  {
    key: 'booking_date',
    label: 'Booking Date',
    required: false,
    type: 'string',
  },
  {
    key: 'description_assignment',
    label: 'Description Assignment',
    required: false,
    type: 'string',
  },
  {
    key: 'source_ticket',
    label: 'Source Ticket',
    required: false,
    type: 'string',
  },
  { key: 'subsidiary', label: 'Subsidiary', required: false, type: 'string' },
  {
    key: 'external_ticket_id',
    label: 'External Ticket ID',
    required: false,
    type: 'string',
  },
  { key: 'channel', label: 'Channel', required: false, type: 'string' },
  {
    key: 'customer_type',
    label: 'Customer Type',
    required: false,
    type: 'string',
  },
  { key: 'closed_by', label: 'Closed By', required: false, type: 'string' },
  {
    key: 'closed_reopen_by',
    label: 'Closed / Reopen By',
    required: false,
    type: 'string',
  },
  { key: 'customer_id', label: 'Customer ID', required: false, type: 'string' },
  {
    key: 'customer_name',
    label: 'Nama Pelanggan',
    required: false,
    type: 'string',
  },
  {
    key: 'service_no',
    label: 'Nomor Layanan',
    required: false,
    type: 'string',
  },
  { key: 'service_id', label: 'ID Layanan', required: false, type: 'string' },
  { key: 'slg', label: 'SLG', required: false, type: 'string' },
  { key: 'technology', label: 'Technology', required: false, type: 'string' },
  { key: 'lapul', label: 'LAPUL', required: false, type: 'string' },
  { key: 'gaul', label: 'GAUL', required: false, type: 'string' },
  { key: 'onu_rx', label: 'ONU RX', required: false, type: 'string' },
  {
    key: 'pending_reason',
    label: 'Pending Reason',
    required: false,
    type: 'string',
  },
  {
    key: 'date_modified',
    label: 'Date Modified',
    required: false,
    type: 'string',
  },
  {
    key: 'incident_domain',
    label: 'Incident Domain',
    required: false,
    type: 'string',
  },
  { key: 'region', label: 'Region', required: false, type: 'string' },
  {
    key: 'hierarchy_path',
    label: 'Hierarchy Path',
    required: false,
    type: 'string',
  },
  {
    key: 'description_actual_solution',
    label: 'Description Actual Solution',
    required: false,
    type: 'string',
  },
  { key: 'kode_produk', label: 'Kode Produk', required: false, type: 'string' },
  { key: 'perangkat', label: 'Perangkat', required: false, type: 'string' },
  { key: 'technician', label: 'Teknisi', required: false, type: 'string' },
  { key: 'device_name', label: 'Device Name', required: false, type: 'string' },
  {
    key: 'worklog_summary',
    label: 'Worklog Summary',
    required: false,
    type: 'string',
  },
  {
    key: 'last_update_worklog',
    label: 'Last Update Worklog',
    required: false,
    type: 'string',
  },
  {
    key: 'classification_flag',
    label: 'Classification Flag',
    required: false,
    type: 'string',
  },
  { key: 'realm', label: 'Realm', required: false, type: 'string' },
  {
    key: 'related_to_gamas',
    label: 'Related To Gamas',
    required: false,
    type: 'string',
  },
  { key: 'tsc_result', label: 'TSC Result', required: false, type: 'string' },
  { key: 'scc_result', label: 'SCC Result', required: false, type: 'string' },
  { key: 'ttr_agent', label: 'TTR Agent', required: false, type: 'string' },
  { key: 'ttr_mitra', label: 'TTR Mitra', required: false, type: 'string' },
  {
    key: 'ttr_nasional',
    label: 'TTR Nasional',
    required: false,
    type: 'string',
  },
  { key: 'ttr_pending', label: 'TTR Pending', required: false, type: 'string' },
  { key: 'ttr_region', label: 'TTR Region', required: false, type: 'string' },
  { key: 'ttr_witel', label: 'TTR Witel', required: false, type: 'string' },
  {
    key: 'ttr_end_to_end',
    label: 'TTR End To End',
    required: false,
    type: 'string',
  },
  { key: 'note', label: 'Note', required: false, type: 'string' },
  {
    key: 'guarantee_status',
    label: 'Guarantee Status',
    required: false,
    type: 'string',
  },
  {
    key: 'resolve_date',
    label: 'Resolve Date',
    required: false,
    type: 'string',
  },
  { key: 'sn_ont', label: 'SN ONT', required: false, type: 'string' },
  { key: 'tipe_ont', label: 'Tipe ONT', required: false, type: 'string' },
  {
    key: 'manufacture_ont',
    label: 'Manufacture ONT',
    required: false,
    type: 'string',
  },
  {
    key: 'impacted_site',
    label: 'Impacted Site',
    required: false,
    type: 'string',
  },
  { key: 'cause', label: 'Cause', required: false, type: 'string' },
  { key: 'solution', label: 'Solution', required: false, type: 'string' },
  { key: 'resolution', label: 'Resolution', required: false, type: 'string' },
  {
    key: 'notes_eskalasi',
    label: 'Notes Eskalasi',
    required: false,
    type: 'string',
  },
  {
    key: 'rk_information',
    label: 'RK Information',
    required: false,
    type: 'string',
  },
  {
    key: 'external_ticket_tier_3',
    label: 'External Ticket Tier 3',
    required: false,
    type: 'string',
  },
  {
    key: 'customer_category',
    label: 'Customer Category',
    required: false,
    type: 'string',
  },
  {
    key: 'classification_path',
    label: 'Classification Path',
    required: false,
    type: 'string',
  },
  {
    key: 'teritory_near_end',
    label: 'Teritory Near End',
    required: false,
    type: 'string',
  },
  {
    key: 'teritory_far_end',
    label: 'Teritory Far End',
    required: false,
    type: 'string',
  },
  { key: 'urgency', label: 'Urgency', required: false, type: 'string' },
  {
    key: 'urgency_description',
    label: 'Urgency Description',
    required: false,
    type: 'string',
  },
  {
    key: 'customer_segment',
    label: 'Customer Segment',
    required: false,
    type: 'string',
  },
  {
    key: 'service_type',
    label: 'Service Type',
    required: false,
    type: 'string',
  },
  {
    key: 'ticket_id_gamas',
    label: 'ID Gamas',
    required: false,
    type: 'string',
  },
  {
    key: 'contact_name',
    label: 'Nama Kontak',
    required: false,
    type: 'string',
  },
  {
    key: 'contact_phone',
    label: 'No. Telepon',
    required: false,
    type: 'string',
  },
  {
    key: 'contact_email',
    label: 'Contact Email',
    required: false,
    type: 'string',
  },
];

export const FIELD_CANDIDATES: Record<string, string[]> = {
  incident: [
    'INCIDENT',
    'INCIDENT ID',
    'INCIDENT_NO',
    'ID',
    'NO',
    'NOMOR',
    'NO_TIKET',
    'TICKET',
    'TICKET ID',
    'TICKET_NO',
    'ID TIKET',
  ],
  status: [
    'STATUS',
    'STATUS TIKET',
    'STATUS_TICKET',
    'STATE',
    'STATUS PEKERJAAN',
  ],
  reported_date: [
    'REPORTED DATE',
    'REPORTED_DATE',
    'TGL LAPOR',
    'TANGGAL LAPOR',
    'DATE',
    'TANGGAL',
    'TGL',
    'CREATED DATE',
    'CREATED_DATE',
  ],
  workzone: ['WORKZONE', 'WORK ZONE'],
  witel: ['WITEL', 'REGIONAL', 'WITEL / REGIONAL'],
  symptom: [
    'SYMPTOM',
    'KELUHAN',
    'GANGGUAN',
    'DESCRIPTION',
    'DESKRIPSI',
    'PROBLEM',
    'ISSUE',
  ],
  summary: ['SUMMARY', 'SUBJECT', 'JUDUL', 'TITLE', 'DESCRIPTION'],
  customer_name: [
    'CUSTOMER NAME',
    'CUSTOMER_NAME',
    'NAMA PELANGGAN',
    'PELANGGAN',
    'CUSTOMER',
    'NAME',
  ],
  customer_id: [
    'CUSTOMER ID',
    'CUSTOMER_ID',
    'ID PELANGGAN',
    'CUSTOMER',
    'CID',
  ],
  service_no: [
    'SERVICE NO',
    'SERVICE_NO',
    'NOMOR LAYANAN',
    'SERVICE NUMBER',
    'SERVICE',
    'NO LAYANAN',
  ],
  service_id: ['SERVICE ID', 'SERVICE_ID', 'ID LAYANAN', 'SVC ID'],
  owner_group: [
    'OWNER GROUP',
    'OWNER_GROUP',
    'GROUP',
    'DIVISI',
    'DEPARTMENT',
    'DEPT',
  ],
  owner: ['OWNER'],
  technician: [
    'TECHNICIAN',
    'TEKNISI',
    'ASSIGNEE',
    'ASSIGNED TO',
    'NAMA TEKNISI',
  ],
  worklog_summary: [
    'WORKLOG SUMMARY',
    'WORKLOG_SUMMARY',
    'WORKLOG',
    'CLOSE NOTE',
    'RESOLUTION NOTE',
  ],
  last_update_worklog: ['LAST UPDATE WORKLOG', 'LAST_UPDATE_WORKLOG'],
  guarantee_status: [
    'GUARANTE STATUS',
    'GUARANTEE STATUS',
    'GUARANTEE_STATUS',
    'GUARANTEE',
    'GARANSI',
    'FLAGGING',
    'FFG',
  ],
  solution: ['SOLUTION', 'SOLVE', 'RESOLUTION', 'RESOLVE'],
  reported_by: ['REPORTED BY'],
  booking_date: ['BOOKING DATE'],
  description_assignment: ['DESCRIPTION ASSIGMENT', 'DESCRIPTION ASSIGNMENT'],
  reported_priority: ['REPORTED PRIORITY'],
  source_ticket: ['SOURCE TICKET'],
  subsidiary: ['SUBSIDIARY'],
  external_ticket_id: ['EXTERNAL TICKET ID'],
  channel: ['CHANNEL'],
  customer_type: ['CUSTOMER TYPE'],
  closed_by: ['CLOSED BY'],
  closed_reopen_by: ['CLOSED / REOPEN BY', 'CLOSED/REOPEN BY'],
  status_date: ['STATUS DATE'],
  pending_reason: [
    'PENDING REASON',
    'PENDING_REASON',
    'ALASAN PENDING',
    'PENDING',
  ],
  customer_segment: [
    'CUSTOMER SEGMENT',
    'CUSTOMER_SEGMENT',
    'SEGMENT',
    'SEGMENT CUSTOMER',
  ],
  service_type: [
    'SERVICE TYPE',
    'SERVICE_TYPE',
    'TYPE',
    'JENIS LAYANAN',
    'JENIS',
  ],
  ticket_id_gamas: ['TICKET ID GAMAS', 'GAMAS', 'ID GAMAS', 'GAMAS ID'],
  contact_name: ['CONTACT NAME', 'CONTACT_NAME', 'NAMA KONTAK', 'CONTACT'],
  contact_phone: [
    'CONTACT PHONE',
    'CONTACT_PHONE',
    'PHONE',
    'TELEPON',
    'NO TELP',
    'NO TELEPON',
  ],
  contact_email: ['CONTACT EMAIL', 'CONTACT_EMAIL', 'EMAIL'],
  ttr_customer: ['TTR CUSTOMER'],
  date_modified: ['DATEMODIFIED', 'DATE MODIFIED'],
  incident_domain: ['INCIDENT DOMAIN'],
  region: ['REGION'],
  hierarchy_path: ['HIERARCHY PATH'],
  description_actual_solution: ['DESCRIPTION ACTUAL SOLUTION'],
  kode_produk: ['KODE PRODUK'],
  perangkat: ['PERANGKAT'],
  device_name: ['DEVICE NAME'],
  classification_flag: ['CLASSIFICATION FLAG'],
  realm: ['REALM'],
  related_to_gamas: ['RELATED TO GAMAS'],
  tsc_result: ['TSC RESULT'],
  scc_result: ['SCC RESULT'],
  ttr_agent: ['TTR AGENT'],
  ttr_mitra: ['TTR MITRA'],
  ttr_nasional: ['TTR NASIONAL'],
  ttr_pending: ['TTR PENDING'],
  ttr_region: ['TTR REGION'],
  ttr_witel: ['TTR WITEL'],
  ttr_end_to_end: ['TTR END TO END'],
  note: ['NOTE'],
  resolve_date: ['RESOLVE DATE'],
  sn_ont: ['SN ONT'],
  tipe_ont: ['TIPE ONT'],
  manufacture_ont: ['MANUFACTURE ONT'],
  impacted_site: ['IMPACTED SITE'],
  cause: ['CAUSE'],
  resolution: ['RESOLUTION'],
  notes_eskalasi: ['NOTES ESKALASI'],
  rk_information: ['RK INFORMATION'],
  external_ticket_tier_3: ['EXTERNAL TICKET TIER 3'],
  customer_category: ['CUSTOMER CATEGORY'],
  classification_path: ['CLASSIFICATION PATH'],
  teritory_near_end: ['TERITORY NEAR END'],
  teritory_far_end: ['TERITORY FAR END'],
  urgency: ['URGENCY'],
  urgency_description: ['URGENCY DESCRIPTION'],
};

export const REQUIRED_FIELDS = TICKET_RAW_FIELDS.filter((f) => f.required).map(
  (f) => f.key,
);
export const REQUIRED_LABELS = TICKET_RAW_FIELDS.filter((f) => f.required).map(
  (f) => f.label,
);

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function autoDetectMapping(
  headers: string[],
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalized = header.trim().toUpperCase().replace(/\s+/g, ' ');
    let matched: string | null = null;
    const normalizedCompact = normalizeHeader(header);

    for (const [fieldKey, candidates] of Object.entries(FIELD_CANDIDATES)) {
      if (usedFields.has(fieldKey)) continue;
      const fieldKeyNormalized = normalizeHeader(fieldKey);
      if (
        fieldKeyNormalized === normalizedCompact ||
        candidates.some((c) => normalizeHeader(c) === normalizedCompact)
      ) {
        matched = fieldKey;
        usedFields.add(fieldKey);
        break;
      }
    }

    mapping[header] = matched;
  }

  return mapping;
}

export function validateDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Boolean(parseWIBDateInput(trimmed));
}
