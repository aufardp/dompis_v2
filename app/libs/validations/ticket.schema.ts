import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const assignTicketSchema = z.object({
  ticketId: positiveInt,
  teknisiUserId: positiveInt,
  forceReassign: z.boolean().optional().default(false),
});

export const unassignTicketSchema = z.object({
  ticketId: positiveInt,
});

export const pickupTicketSchema = z.object({
  ticketId: positiveInt,
});

export const closeTicketSchema = z.object({
  ticketId: positiveInt,
  rca: optionalTrimmedString(100),
  subRca: optionalTrimmedString(100),
  descriptionSolutionDompis: z.string().trim().min(10).max(255),
});

export const updateTicketSchema = z.object({
  ticketId: positiveInt,
  resume: z.boolean().optional(),
  patch: z
    .object({
      summary: optionalTrimmedString(65535),
      ownerGroup: optionalTrimmedString(50),
      owner_group: optionalTrimmedString(50),
      status: optionalTrimmedString(100),
      workzone: optionalTrimmedString(100),
      serviceType: optionalTrimmedString(50),
      service_type: optionalTrimmedString(50),
      customerSegment: optionalTrimmedString(100),
      customer_segment: optionalTrimmedString(100),
      customerType: optionalTrimmedString(100),
      customer_type: optionalTrimmedString(100),
      serviceNo: optionalTrimmedString(100),
      service_no: optionalTrimmedString(100),
      contactName: optionalTrimmedString(100),
      contact_name: optionalTrimmedString(100),
      contactPhone: optionalTrimmedString(50),
      contact_phone: optionalTrimmedString(50),
      deviceName: optionalTrimmedString(100),
      device_name: optionalTrimmedString(100),
      symptom: optionalTrimmedString(65535),
      alamat: optionalTrimmedString(65535),
      pendingDompis: optionalTrimmedString(255),
      descriptionSolutionDompis: optionalTrimmedString(255),
      description_solution_dompis: optionalTrimmedString(255),
    })
    .partial()
    .optional(),
  workflow: z
    .object({
      status: optionalTrimmedString(50),
      statusUpdate: optionalTrimmedString(50),
      hasilVisit: optionalTrimmedString(50),
      hasil_visit: optionalTrimmedString(50),
      newStatus: optionalTrimmedString(50),
      pendingDompis: optionalTrimmedString(255),
      note: optionalTrimmedString(255),
    })
    .partial()
    .optional(),
  pendingDompis: optionalTrimmedString(255),
  description: optionalTrimmedString(255),
})
  .passthrough();

export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type UnassignTicketInput = z.infer<typeof unassignTicketSchema>;
export type PickupTicketInput = z.infer<typeof pickupTicketSchema>;
export type CloseTicketInput = z.infer<typeof closeTicketSchema>;
export type UpdateTicketInputSchema = z.infer<typeof updateTicketSchema>;
