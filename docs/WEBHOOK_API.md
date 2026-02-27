# Webhook API Documentation

## Overview

This webhook API allows external services (like Google Apps Script) to queue events that will be dispatched to a configured webhook URL.

## Architecture

```
┌─────────────────┐
│ Google Apps     │
│ Script          │
└────┬────────────┘
     │ POST /api/webhook/queue
     │ { eventType, payload }
     ▼
┌─────────────────────────────────┐
│ Your Next.js Server             │
│ 1. Validate API key             │
│ 2. Store in tech_event_outbox   │
│ 3. Return { success: true }     │
└────┬────────────────────────────┘
     │
     │ Cron runs every minute
     ▼
┌─────────────────────────────────┐
│ /api/integrations/tech-events   │
│ /dispatch (cron-triggered)      │
│ 1. Fetch PENDING events         │
│ 2. Send to WEBHOOK_URL          │
│ 3. Update status to SENT        │
└────┬────────────────────────────┘
     │
     │ POST { events: [...] }
     ▼
┌─────────────────────────────────┐
│ Target Webhook (Telegram,       │
│ Slack, Discord, Apps Script)    │
└─────────────────────────────────┘
```

---

## API Endpoint

### `POST /api/webhook/queue`

Queue an event for later dispatch to the configured webhook URL.

#### Headers

| Header          | Required | Description                          |
|-----------------|----------|--------------------------------------|
| `Authorization` | Yes      | `Bearer YOUR_API_KEY`                |
| `Content-Type`  | Yes      | `application/json`                   |

#### Request Body

```json
{
  "eventType": "string",
  "payload": {
    "any": "data"
  }
}
```

| Field       | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| `eventType` | string | Yes      | Type of event (e.g., `NOTIFICATION`) |
| `payload`   | object | Yes      | Event data (any JSON object)         |

#### Success Response (200)

```json
{
  "success": true,
  "message": "Event queued successfully",
  "data": {
    "eventId": "evt_1234567890_abc123",
    "queuedAt": "2026-02-27T10:30:00Z"
  }
}
```

#### Error Responses

**401 Unauthorized** - Invalid or missing API key
```json
{
  "success": false,
  "message": "Unauthorized - Invalid or missing API key"
}
```

**400 Bad Request** - Invalid request body
```json
{
  "success": false,
  "message": "Missing or invalid eventType (string required)"
}
```

**500 Internal Server Error** - Server error
```json
{
  "success": false,
  "message": "Failed to queue event"
}
```

---

## Google Apps Script Integration

### Basic Example

```javascript
/**
 * Send a webhook event from Google Apps Script
 */
function sendWebhookEvent() {
  const webhookUrl = 'https://your-domain.com/api/webhook/queue';
  const apiKey = 'YOUR_API_KEY';
  
  const payload = {
    eventType: 'NOTIFICATION',
    payload: {
      chatId: '-100123456789',
      message: 'Hello from Google Apps Script!',
      timestamp: new Date().toISOString()
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(webhookUrl, options);
  const result = JSON.parse(response.getContentText());
  
  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Result: ' + JSON.stringify(result));
  
  return result;
}
```

### Telegram Bot Example

```javascript
/**
 * Send Telegram message via webhook
 */
function sendTelegramMessage(chatId, message) {
  const webhookUrl = 'https://your-domain.com/api/webhook/queue';
  const apiKey = 'YOUR_API_KEY';
  
  const payload = {
    eventType: 'TELEGRAM_MESSAGE',
    payload: {
      chatId: chatId,
      text: message,
      parseMode: 'Markdown'
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(webhookUrl, options);
  return JSON.parse(response.getContentText());
}

// Usage
function notifyTeam() {
  sendTelegramMessage(
    '-100123456789',
    '🔔 *New Ticket Alert*\n\n' +
    'Incident: INC123\n' +
    'Workzone: Jakarta\n' +
    'Status: OPEN'
  );
}
```

### Ticket Status Change Example

```javascript
/**
 * Send ticket status change event
 * Matches your application's TechEventPayload structure
 */
function sendTicketStatusChange() {
  const webhookUrl = 'https://your-domain.com/api/webhook/queue';
  const apiKey = 'YOUR_API_KEY';
  
  const payload = {
    eventType: 'TICKET_STATUS_CHANGED',
    payload: {
      event_id: 'evt-' + Date.now(),
      event_type: 'TICKET_STATUS_CHANGED',
      occurred_at: new Date().toISOString(),
      ticket: {
        id: 999,
        incident: 'TEST_INCIDENT',
        workzone: 'TEST',
        service_no: '152415230585',
        customer_name: 'PELANGGAN1'
      },
      status: {
        old_hasil_visit: 'ASSIGNED',
        new_hasil_visit: 'ON_PROGRESS',
        pending_reason: null,
        evidence: null
      },
      old_technician: null,
      new_technician: {
        id_user: 1,
        nik: 'TEST001',
        nama: 'Test Tech'
      },
      actor: {
        id_user: 1,
        role: 'admin'
      }
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(webhookUrl, options);
  return JSON.parse(response.getContentText());
}
```

### Batch Notifications Example

```javascript
/**
 * Send multiple webhook events
 */
function sendBatchNotifications(events) {
  const webhookUrl = 'https://your-domain.com/api/webhook/queue';
  const apiKey = 'YOUR_API_KEY';
  
  const results = [];
  
  events.forEach(function(event) {
    const payload = {
      eventType: event.type,
      payload: event.data
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(webhookUrl, options);
    results.push({
      event: event.type,
      status: response.getResponseCode(),
      result: JSON.parse(response.getContentText())
    });
    
    // Add delay to avoid rate limiting
    Utilities.sleep(100);
  });
  
  return results;
}

// Usage
function notifyAllTeams() {
  const events = [
    {
      type: 'TELEGRAM_MESSAGE',
      data: { chatId: '-100111', text: 'Message to Team A' }
    },
    {
      type: 'TELEGRAM_MESSAGE',
      data: { chatId: '-100222', text: 'Message to Team B' }
    }
  ];
  
  const results = sendBatchNotifications(events);
  Logger.log(JSON.stringify(results));
}
```

### Trigger-Based Notifications

```javascript
/**
 * Send notification when Google Sheet is updated
 */
function onSheetUpdate(e) {
  const webhookUrl = 'https://your-domain.com/api/webhook/queue';
  const apiKey = 'YOUR_API_KEY';
  
  const payload = {
    eventType: 'SHEET_UPDATED',
    payload: {
      sheetName: e.source.getActiveSheet().getName(),
      range: e.range.getA1Notation(),
      value: e.value,
      updatedBy: Session.getActiveUser().getEmail(),
      timestamp: new Date().toISOString()
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(webhookUrl, options);
}
```

---

## Environment Variables

Set these in your `.env` file:

```bash
# API Keys for external callers (comma-separated)
WEBHOOK_API_KEYS="key1,key2,key3"

# Target webhook URL where events will be dispatched
TECH_EVENTS_WEBHOOK_URL="https://your-webhook-target.com/endpoint"

# HMAC secret for webhook signature (optional)
TECH_EVENTS_WEBHOOK_SECRET="your-hmac-secret"

# Enable/disable webhook dispatch
TECH_EVENTS_WEBHOOK_ENABLED=true

# Cron secret for dispatcher
CRON_SECRET="your-cron-secret"
```

---

## Testing

### Using the Test Script

```bash
# Set your test API key
export TEST_WEBHOOK_API_KEY="key1-change-this"

# Run the test
npm run test:webhook
# or
tsx scripts/test-webhook.ts
```

### Using cURL

```bash
# Valid request
curl -X POST http://localhost:3000/api/webhook/queue \
  -H "Authorization: Bearer key1-change-this" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "payload": {
      "message": "Hello World",
      "timestamp": "2026-02-27T10:30:00Z"
    }
  }'

# Missing API key (should return 401)
curl -X POST http://localhost:3000/api/webhook/queue \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TEST_EVENT",
    "payload": {}
  }'
```

---

## Event Types

You can use any event type. Common examples:

### Standard Event Types (Matches Your App Schema)

| Event Type           | Description                        | Example Payload Structure                          |
|----------------------|------------------------------------|---------------------------------------------------|
| `TICKET_STATUS_CHANGED` | Ticket status updated           | `{ event_id, event_type, occurred_at, ticket, status, old_technician, new_technician, actor }` |
| `TICKET_ASSIGNED`    | Ticket assigned to technician     | Same as above                                     |
| `TICKET_UNASSIGNED`  | Technician unassigned from ticket | Same as above                                     |
| `TICKET_CREATED`     | New ticket created                | Same as above                                     |
| `TICKET_CLOSED`      | Ticket closed                     | Same as above                                     |

### Ticket Status Change Payload Example

```json
{
  "event_id": "evt-1234567890",
  "event_type": "TICKET_STATUS_CHANGED",
  "occurred_at": "2026-02-26T12:00:00.000Z",
  "ticket": {
    "id": 999,
    "incident": "TEST_INCIDENT",
    "workzone": "TEST",
    "service_no": "152415230585",
    "customer_name": "PELANGGAN1"
  },
  "status": {
    "old_hasil_visit": "ASSIGNED",
    "new_hasil_visit": "ON_PROGRESS",
    "pending_reason": null,
    "evidence": null
  },
  "old_technician": null,
  "new_technician": {
    "id_user": 1,
    "nik": "TEST001",
    "nama": "Test Tech"
  },
  "actor": {
    "id_user": 1,
    "role": "admin"
  }
}
```

### Valid Status Values (HasilVisit)

```typescript
type HasilVisit =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'DONE'
  | 'CLOSE'
  | 'CANCELLED';
```

### Generic Event Types (Custom)

| Event Type           | Description                        | Example Payload                          |
|----------------------|------------------------------------|------------------------------------------|
| `NOTIFICATION`       | General notification               | `{ chatId, message }`                    |
| `TELEGRAM_MESSAGE`   | Telegram bot message               | `{ chatId, text, parseMode }`            |
| `SLACK_MESSAGE`      | Slack bot message                  | `{ channel, text, blocks }`              |
| `DISCORD_MESSAGE`    | Discord bot message                | `{ channelId, content, embed }`          |
| `EMAIL`              | Email notification                 | `{ to, subject, body }`                  |
| `SHEET_UPDATED`      | Google Sheets update               | `{ sheetName, range, value }`            |
| `CUSTOM_EVENT`       | Any custom event                   | `{ any: "data" }`                        |

---

## Security

### API Keys

- Generate strong, random API keys
- Share keys securely with teammates
- Rotate keys periodically
- Revoke compromised keys immediately

### Rate Limiting

The API uses Redis-based rate limiting. Configure limits in `lib/ratelimit.ts`.

### CORS

CORS is enabled for all origins (`*`). For production, consider restricting to specific domains.

---

## Troubleshooting

### Events Not Being Dispatched

1. Check if cron is enabled: `CRON_ENABLED=true`
2. Verify webhook URL: `TECH_EVENTS_WEBHOOK_URL` is set
3. Check pending events in database:
   ```sql
   SELECT * FROM tech_event_outbox WHERE status = 'PENDING';
   ```

### 401 Unauthorized

- Ensure API key is correct
- Check `Authorization: Bearer YOUR_API_KEY` header format
- Verify key exists in `WEBHOOK_API_KEYS`

### CORS Errors

- Ensure server sends CORS headers
- Check browser console for specific error
- Verify OPTIONS preflight request succeeds

---

## Support

For issues or questions, contact the development team.
