export interface Ticket {
  INCIDENT: string;
  SUMMARY: string;
  REPORTED_DATE: string;
  OWNER_GROUP: string;
  CUSTOMER_SEGMENT: string;
  SERVICE_TYPE: string;
  WORKZONE: string;
  STATUS: string;
  TICKET_ID_GAMAS: string;
  CONTACT_PHONE: string;
  CONTACT_NAME: string;
  BOOKING_DATE: string;
  SOURCE_TICKET: string;
  CUSTOMER_TYPE: string;
  SERVICE_NO: string;
  SYMPTOM: string;
  DESCRIPTION_ACTUAL_SOLUTION: string;
  DEVICE_NAME: string;
  HASIL_VISIT: string;
  JAM_EXPIRED_12_JAM_GOLD: string;
  STATUS_TTR_12_GOLD: string;
  JAM_EXPIRED_3_JAM_DIAMOND: string;
  STATUS_TTR_3_DIAMOND: string;
  JAM_EXPIRED_24_JAM_REGULER: string;
  STATUS_TTR_24_REGULER: string;
  REDAMAN: string;
  JAM_EXPIRED_6_JAM_PLATINUM: string;
  STATUS_TTR_6_PLATINUM: string;
  JENIS_TIKET: string;
  JAM_EXPIRED: string;
  teknisi_user_id: number | null;
  rca: string;
  sub_rca: string;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}

export interface PushResult {
  success: boolean;
  count: number;
  error?: string;
}

export interface UpdateTicketResponse {
  success: boolean;
  db_updated: boolean;
  sheets_updated: boolean;
  warning?: string;
  message?: string;
}
