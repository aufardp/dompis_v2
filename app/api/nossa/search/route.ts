import { NextResponse } from 'next/server';
import { prisma } from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoundedString } from '@/lib/http-query';

export async function GET(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'nossa-search',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const { searchParams } = new URL(req.url);
    const incident = toBoundedString(searchParams.get('incident'), 50);

    if (!incident) {
      return NextResponse.json(
        {
          success: false,
          message: 'Query parameter "incident" is required',
        },
        { status: 400 },
      );
    }

    const row = await prisma.ticket_raw.findFirst({
      where: { incident },
    });

    if (!row) {
      return NextResponse.json({
        success: true,
        data: null,
        resource: null,
        found: false,
        incident,
      });
    }

    const resource = row.sourceTable === 'nossa' ? 'nossa' : 'nossa_closed';

    const data = {
      incident: row.incident,
      ttr_customer: row.ttr_customer,
      summary: row.summary,
      reported_date: row.reported_date,
      owner_group: row.owner_group,
      owner: row.owner,
      customer_segment: row.customer_segment,
      service_type: row.service_type,
      witel: row.witel,
      workzone: row.workzone,
      status: row.status,
      status_date: row.status_date,
      ticket_id_gamas: row.ticket_id_gamas,
      reported_by: row.reported_by,
      contact_phone: row.contact_phone,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      booking_date: row.booking_date,
      description_assignment: row.description_assignment,
      reported_priority: row.reported_priority,
      source_ticket: row.source_ticket,
      subsidiary: row.subsidiary,
      external_ticket_id: row.external_ticket_id,
      channel: row.channel,
      customer_type: row.customer_type,
      closed_by: row.closed_by,
      closed_reopen_by: row.closed_reopen_by,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      service_id: row.service_id,
      service_no: row.service_no,
      slg: row.slg,
      technology: row.technology,
      lapul: row.lapul,
      gaul: row.gaul,
      onu_rx: row.onu_rx,
      pending_reason: row.pending_reason,
      date_modified: row.date_modified,
      incident_domain: row.incident_domain,
      region: row.region,
      symptom: row.symptom,
      hierarchy_path: row.hierarchy_path,
      solution: row.solution,
      description_actual_solution: row.description_actual_solution,
      kode_produk: row.kode_produk,
      perangkat: row.perangkat,
      technician: row.technician,
      device_name: row.device_name,
      worklog_summary: row.worklog_summary,
      last_update_worklog: row.last_update_worklog,
      classification_flag: row.classification_flag,
      realm: row.realm,
      related_to_gamas: row.related_to_gamas,
      tsc_result: row.tsc_result,
      scc_result: row.scc_result,
      ttr_agent: row.ttr_agent,
      ttr_mitra: row.ttr_mitra,
      ttr_nasional: row.ttr_nasional,
      ttr_pending: row.ttr_pending,
      ttr_region: row.ttr_region,
      ttr_witel: row.ttr_witel,
      ttr_end_to_end: row.ttr_end_to_end,
      note: row.note,
      guarantee_status: row.guarantee_status,
      resolve_date: row.resolve_date,
      sn_ont: row.sn_ont,
      tipe_ont: row.tipe_ont,
      manufacture_ont: row.manufacture_ont,
      impacted_site: row.impacted_site,
      cause: row.cause,
      resolution: row.resolution,
      notes_eskalasi: row.notes_eskalasi,
      rk_information: row.rk_information,
      external_ticket_tier_3: row.external_ticket_tier_3,
      customer_category: row.customer_category,
      classification_path: row.classification_path,
      teritory_near_end: row.teritory_near_end,
      teritory_far_end: row.teritory_far_end,
      urgency: row.urgency,
      urgency_description: row.urgency_description,
      street_address: row.street_address,
      _sourceTable: row.sourceTable ?? resource,
      _rawPayload: (row.rawPayload ?? {}) as Record<string, unknown>,
    };

    return NextResponse.json({
      success: true,
      data,
      resource,
      found: true,
      incident,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to search external ticket'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
