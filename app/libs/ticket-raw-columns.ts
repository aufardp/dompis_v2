export interface TicketRawField {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'date';
}

export const TICKET_RAW_FIELDS: TicketRawField[] = [
  { key: 'incident', label: 'Nomor Tiket (Incident)', required: true, type: 'string' },
  { key: 'status', label: 'Status', required: true, type: 'string' },
  { key: 'reported_date', label: 'Tanggal Lapor', required: true, type: 'date' },
  { key: 'workzone', label: 'Workzone / SA', required: true, type: 'string' },
  { key: 'symptom', label: 'Symptom / Gangguan', required: false, type: 'string' },
  { key: 'summary', label: 'Summary / Deskripsi', required: false, type: 'string' },
  { key: 'customer_name', label: 'Nama Pelanggan', required: false, type: 'string' },
  { key: 'customer_id', label: 'ID Pelanggan', required: false, type: 'string' },
  { key: 'service_no', label: 'Nomor Layanan', required: false, type: 'string' },
  { key: 'service_id', label: 'ID Layanan', required: false, type: 'string' },
  { key: 'owner_group', label: 'Owner Group / Divisi', required: false, type: 'string' },
  { key: 'technician', label: 'Teknisi', required: false, type: 'string' },
  { key: 'worklog_summary', label: 'Worklog Summary', required: false, type: 'string' },
  { key: 'guarantee_status', label: 'Guarantee Status', required: false, type: 'string' },
  { key: 'solution', label: 'Solution', required: false, type: 'string' },
  { key: 'pending_reason', label: 'Pending Reason', required: false, type: 'string' },
  { key: 'customer_segment', label: 'Customer Segment', required: false, type: 'string' },
  { key: 'service_type', label: 'Service Type', required: false, type: 'string' },
  { key: 'witel', label: 'Witel / Regional', required: false, type: 'string' },
  { key: 'ticket_id_gamas', label: 'ID Gamas', required: false, type: 'string' },
  { key: 'contact_name', label: 'Nama Kontak', required: false, type: 'string' },
  { key: 'contact_phone', label: 'No. Telepon', required: false, type: 'string' },
];

export const FIELD_CANDIDATES: Record<string, string[]> = {
  incident: ['INCIDENT', 'INCIDENT ID', 'INCIDENT_NO', 'ID', 'NO', 'NOMOR', 'NO_TIKET', 'TICKET', 'TICKET ID', 'TICKET_NO', 'ID TIKET'],
  status: ['STATUS', 'STATUS TIKET', 'STATUS_TICKET', 'STATE', 'STATUS PEKERJAAN'],
  reported_date: ['REPORTED DATE', 'REPORTED_DATE', 'TGL LAPOR', 'TANGGAL LAPOR', 'DATE', 'TANGGAL', 'TGL', 'CREATED DATE', 'CREATED_DATE'],
  workzone: ['WORKZONE', 'WITEL', 'SA', 'AREA', 'STO', 'SATUAN KERJA', 'WORK ZONE'],
  symptom: ['SYMPTOM', 'KELUHAN', 'GANGGUAN', 'DESCRIPTION', 'DESKRIPSI', 'PROBLEM', 'ISSUE'],
  summary: ['SUMMARY', 'SUBJECT', 'JUDUL', 'TITLE', 'DESCRIPTION'],
  customer_name: ['CUSTOMER NAME', 'CUSTOMER_NAME', 'NAMA PELANGGAN', 'PELANGGAN', 'CUSTOMER', 'NAME'],
  customer_id: ['CUSTOMER ID', 'CUSTOMER_ID', 'ID PELANGGAN', 'CUSTOMER', 'CID'],
  service_no: ['SERVICE NO', 'SERVICE_NO', 'NOMOR LAYANAN', 'SERVICE NUMBER', 'SERVICE', 'NO LAYANAN'],
  service_id: ['SERVICE ID', 'SERVICE_ID', 'ID LAYANAN', 'SVC ID'],
  owner_group: ['OWNER GROUP', 'OWNER_GROUP', 'GROUP', 'DIVISI', 'DEPARTMENT', 'DEPT'],
  technician: ['TECHNICIAN', 'TEKNISI', 'CLOSED BY', 'OWNER', 'ASSIGNEE', 'ASSIGNED TO', 'NAMA TEKNISI'],
  worklog_summary: ['WORKLOG SUMMARY', 'WORKLOG_SUMMARY', 'WORKLOG', 'CLOSE NOTE', 'RESOLUTION NOTE'],
  guarantee_status: ['GUARANTEE STATUS', 'GUARANTEE_STATUS', 'GUARANTEE', 'GARANSI', 'FLAGGING', 'FFG'],
  solution: ['SOLUTION', 'SOLVE', 'RESOLUTION', 'RESOLVE'],
  pending_reason: ['PENDING REASON', 'PENDING_REASON', 'ALASAN PENDING', 'PENDING'],
  customer_segment: ['CUSTOMER SEGMENT', 'CUSTOMER_SEGMENT', 'SEGMENT', 'SEGMENT CUSTOMER'],
  service_type: ['SERVICE TYPE', 'SERVICE_TYPE', 'TYPE', 'JENIS LAYANAN', 'JENIS'],
  ticket_id_gamas: ['TICKET ID GAMAS', 'GAMAS', 'ID GAMAS', 'GAMAS ID'],
  contact_name: ['CONTACT NAME', 'CONTACT_NAME', 'NAMA KONTAK', 'CONTACT'],
  contact_phone: ['CONTACT PHONE', 'CONTACT_PHONE', 'PHONE', 'TELEPON', 'NO TELP', 'NO TELEPON'],
};

export const REQUIRED_FIELDS = TICKET_RAW_FIELDS.filter((f) => f.required).map((f) => f.key);
export const REQUIRED_LABELS = TICKET_RAW_FIELDS.filter((f) => f.required).map((f) => f.label);

export function autoDetectMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalized = header.trim().toUpperCase().replace(/\s+/g, ' ');
    let matched: string | null = null;

    for (const [fieldKey, candidates] of Object.entries(FIELD_CANDIDATES)) {
      if (usedFields.has(fieldKey)) continue;
      if (candidates.some((c) => c.toUpperCase() === normalized)) {
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
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && !isNaN(Date.parse(value))) return true;
  const parsed = new Date(value);
  return !isNaN(parsed.getTime());
}
