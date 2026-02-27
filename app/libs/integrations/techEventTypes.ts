export type TechEventType =
  | 'TICKET_STATUS_CHANGED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_UNASSIGNED'
  | 'TICKET_CREATED'
  | 'TICKET_CLOSED';

export type HasilVisit =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'DONE'
  | 'CLOSE'
  | 'CANCELLED';

export type TechEventTicket = {
  id: number;
  incident: string;
  workzone: string;
  service_no: string;
  customer_name: string;
};

export type TechEventStatus = {
  old_hasil_visit: HasilVisit | null;
  new_hasil_visit: HasilVisit;
  pending_reason: string | null;
  evidence: string | null;
};

export type TechEventTechnician = {
  id_user: number;
  nik: string | null;
  nama: string | null;
} | null;

export type TechEventActor = {
  id_user: number;
  role: string;
};

export type TechEventPayload = {
  event_id: string;
  event_type: TechEventType;
  occurred_at: string;
  ticket: TechEventTicket;
  status: TechEventStatus;
  old_technician: TechEventTechnician;
  new_technician: TechEventTechnician;
  actor: TechEventActor;
};

/**
 * Generic Event Payload
 * For custom events from external sources (e.g., Google Apps Script)
 */
export type GenericEventPayload = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: any;
};

/**
 * Any webhook event (tech-specific or generic)
 */
export type WebhookEvent = TechEventPayload | GenericEventPayload;

export type TechEventWebhookBatch = {
  events: WebhookEvent[];
};
