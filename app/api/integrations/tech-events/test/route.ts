export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { postTechEvents, signTechEventsPayload, buildTechEventsWebhookUrl } from '@/app/libs/integrations/techEvents';

function requireCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('x-cron-secret') || '';
  if (!expected) {
    throw new Error('CRON_SECRET is not configured');
  }
  if (got !== expected) {
    throw new Error('Forbidden');
  }
}

function generateTestPayload(customPayload?: Record<string, unknown>) {
  const now = new Date();
  const ts = now.toISOString();
  const eventId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const defaultPayload = {
    event_id: eventId,
    event_type: 'TICKET_STATUS_CHANGED',
    occurred_at: ts,
    ticket: {
      id: 999,
      incident: 'TEST_WEBHOOK_EVENT',
      workzone: 'TEST',
      service_no: 'TEST-SVC-001',
      customer_name: 'Test Customer',
    },
    status: {
      old_hasil_visit: 'ASSIGNED',
      new_hasil_visit: 'ON_PROGRESS',
      pending_reason: null,
    },
    old_technician: {
      id_user: 1,
      nik: 'TEST001',
      nama: 'Test Technician',
    },
    new_technician: {
      id_user: 1,
      nik: 'TEST001',
      nama: 'Test Technician',
    },
    actor: {
      id_user: 1,
      role: 'admin',
      nama: 'Test Admin',
    },
    test_mode: true,
    test_timestamp: ts,
  };

  // Merge custom payload if provided
  return customPayload ? { ...defaultPayload, ...customPayload } : defaultPayload;
}

export async function POST(req: NextRequest) {
  try {
    requireCronSecret(req);

    // Check if webhook is configured
    const enabled = process.env.TECH_EVENTS_WEBHOOK_ENABLED === 'true';
    const url = process.env.TECH_EVENTS_WEBHOOK_URL;
    const secret = process.env.TECH_EVENTS_WEBHOOK_SECRET;

    if (!enabled) {
      return NextResponse.json(
        {
          success: false,
          message: 'Webhook is disabled (TECH_EVENTS_WEBHOOK_ENABLED is not true)',
        },
        { status: 400 },
      );
    }

    if (!url || !secret) {
      return NextResponse.json(
        {
          success: false,
          message: 'Webhook URL or secret is not configured',
          config: {
            url: url ? '***configured***' : '***missing***',
            secret: secret ? '***configured***' : '***missing***',
          },
        },
        { status: 500 },
      );
    }

    // Parse optional custom payload
    let customPayload: Record<string, unknown> | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        customPayload = body;
      }
    } catch {
      // No body or invalid JSON, use default test payload
    }

    // Generate test payload
    const payload = generateTestPayload(customPayload);

    // Generate signature
    const ts = String(Date.now());
    const rawBody = JSON.stringify(payload);
    const signature = signTechEventsPayload(secret, ts, rawBody);
    const fullUrl = buildTechEventsWebhookUrl(url, ts, signature);

    // Send webhook
    const res = await postTechEvents({ url, secret }, payload);

    const response = {
      success: res.ok,
      message: res.ok ? 'Test webhook sent successfully' : 'Test webhook failed',
      test: {
        payload,
        webhook: {
          url: fullUrl,
          base_url: url,
          status: res.status,
          response: res.text.slice(0, 1000),
        },
        signature,
        timestamp: ts,
        raw_body_preview: rawBody.slice(0, 500),
      },
      config: {
        enabled: true,
        url_configured: true,
        secret_configured: true,
      },
    };

    return NextResponse.json(response, {
      status: res.ok ? 200 : 502,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Forbidden' ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        message: message || 'Test webhook failed',
        error: message,
      },
      { status },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Tech Events Test Endpoint',
    description: 'POST to this endpoint with x-cron-secret header to send a test webhook',
    required_headers: {
      'x-cron-secret': 'Required - Your CRON_SECRET value',
      'Content-Type': 'application/json (if sending custom payload)',
    },
    example_curl: `curl -X POST http://localhost:3000/api/integrations/tech-events/test \\
  -H "Content-Type: application/json" \\
  -H "x-cron-secret: ${process.env.CRON_SECRET || 'YOUR_CRON_SECRET'}" \\
  -d '{"event_type": "TICKET_ASSIGNED"}'`,
    config: {
      enabled: process.env.TECH_EVENTS_WEBHOOK_ENABLED === 'true',
      url_configured: !!process.env.TECH_EVENTS_WEBHOOK_URL,
      secret_configured: !!process.env.TECH_EVENTS_WEBHOOK_SECRET,
    },
  });
}
