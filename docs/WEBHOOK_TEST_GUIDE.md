# Tech Events Webhook - Manual Test Guide

## Overview

The manual test trigger is an optional API endpoint that lets you immediately send a test event to your webhook (without waiting for a real ticket action like assign/close). This helps validate that:

1. ✅ The webhook URL is correct and reachable
2. ✅ HMAC signature is being generated correctly
3. ✅ Your friend's Google Apps Script can receive and verify the payload
4. ✅ The entire flow works end-to-end before relying on real ticket actions

## API Endpoint

```
POST /api/integrations/tech-events/test
```

## Authentication

Requires the `x-cron-secret` header with your `CRON_SECRET` value.

```bash
x-cron-secret: cron12345678
```

## Usage

### 1. Basic Test (Default Payload)

Send a test with the default payload:

```bash
curl -X POST http://localhost:3000/api/integrations/tech-events/test \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: cron12345678"
```

### 2. Test with Custom Payload

Override specific fields in the test payload:

```bash
curl -X POST http://localhost:3000/api/integrations/tech-events/test \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: cron12345678" \
  -d '{
    "event_type": "TICKET_ASSIGNED",
    "ticket": {
      "id": 12345,
      "incident": "CUSTOM_TEST_EVENT"
    }
  }'
```

### 3. Check Endpoint Info (GET)

Get information about the test endpoint:

```bash
curl http://localhost:3000/api/integrations/tech-events/test
```

## Default Test Payload

If you don't provide a custom payload, the endpoint generates this default test payload:

```json
{
  "event_id": "test-1708934400000-abc123",
  "event_type": "TICKET_STATUS_CHANGED",
  "occurred_at": "2024-02-26T12:00:00.000Z",
  "ticket": {
    "id": 999,
    "incident": "TEST_WEBHOOK_EVENT",
    "workzone": "TEST",
    "service_no": "TEST-SVC-001",
    "customer_name": "Test Customer"
  },
  "status": {
    "old_hasil_visit": "ASSIGNED",
    "new_hasil_visit": "ON_PROGRESS",
    "pending_reason": null
  },
  "old_technician": {
    "id_user": 1,
    "nik": "TEST001",
    "nama": "Test Technician"
  },
  "new_technician": {
    "id_user": 1,
    "nik": "TEST001",
    "nama": "Test Technician"
  },
  "actor": {
    "id_user": 1,
    "role": "admin",
    "nama": "Test Admin"
  },
  "test_mode": true,
  "test_timestamp": "2024-02-26T12:00:00.000Z"
}
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Test webhook sent successfully",
  "test": {
    "payload": { ... },
    "webhook": {
      "url": "https://script.google.com/...?ts=123456&sig=abc123&source=dompis",
      "base_url": "https://script.google.com/...",
      "status": 200,
      "response": "Success"
    },
    "signature": "abc123def456...",
    "timestamp": "1708934400000",
    "raw_body_preview": "{\"event_id\":\"test-...\""
  },
  "config": {
    "enabled": true,
    "url_configured": true,
    "secret_configured": true
  }
}
```

### Error Response (502 Bad Gateway)

```json
{
  "success": false,
  "message": "Test webhook failed",
  "test": {
    "payload": { ... },
    "webhook": {
      "url": "https://script.google.com/...?ts=123456&sig=abc123&source=dompis",
      "base_url": "https://script.google.com/...",
      "status": 502,
      "response": "Error message from server"
    },
    "signature": "abc123def456...",
    "timestamp": "1708934400000"
  }
}
```

### Error Response (403 Forbidden)

```json
{
  "success": false,
  "message": "Forbidden",
  "error": "Forbidden"
}
```

## Testing Workflow

### Step 1: Verify Configuration

First, check that your webhook is properly configured:

```bash
curl http://localhost:3000/api/integrations/tech-events/test
```

Look for:
- `config.enabled: true`
- `config.url_configured: true`
- `config.secret_configured: true`

### Step 2: Send Test Webhook

```bash
curl -X POST http://localhost:3000/api/integrations/tech-events/test \
  -H "x-cron-secret: cron12345678"
```

### Step 3: Check Response

Verify:
- `success: true`
- `webhook.status: 200` (or appropriate success code from Google Apps Script)
- `webhook.response` contains expected response

### Step 4: Verify Google Apps Script

Check your Google Apps Script execution logs to confirm:
- Request was received
- HMAC signature was verified successfully
- Payload was processed correctly

### Step 5: Test with Custom Payload (Optional)

Test specific event types:

```bash
curl -X POST http://localhost:3000/api/integrations/tech-events/test \
  -H "x-cron-secret: cron12345678" \
  -d '{
    "event_type": "TICKET_ASSIGNED",
    "actor": {
      "id_user": 5,
      "role": "admin",
      "nama": "Custom Admin"
    }
  }'
```

## HMAC Signature Verification

The webhook URL includes query parameters for verification:

```
https://your-webhook-url.com?ts=1708934400000&sig=abc123def456...&source=dompis
```

### Signature Generation

The signature is generated as:

```typescript
const base = `${ts}.${rawBody}`;
const signature = crypto
  .createHmac('sha256', secret)
  .update(base)
  .digest('hex');
```

### Verification in Google Apps Script

```javascript
function verifySignature(ts, signature, rawBody, secret) {
  const base = ts + '.' + rawBody;
  const expectedSignature = Utilities
    .computeHmacSha256Signature(base, secret)
    .join('')
    .replace(/,/g, '')
    .padStart(64, '0');
  
  return signature === expectedSignature;
}
```

## Troubleshooting

### Issue: "CRON_SECRET is not configured"

**Solution:** Ensure `CRON_SECRET` is set in your `.env` file:
```env
CRON_SECRET=cron12345678
```

### Issue: "Webhook is disabled"

**Solution:** Set `TECH_EVENTS_WEBHOOK_ENABLED=true` in `.env`:
```env
TECH_EVENTS_WEBHOOK_ENABLED=true
```

### Issue: "Webhook URL or secret is not configured"

**Solution:** Add webhook configuration to `.env`:
```env
TECH_EVENTS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
TECH_EVENTS_WEBHOOK_SECRET=bot12345678
```

### Issue: Webhook returns 404 or 500

**Possible causes:**
1. Webhook URL is incorrect
2. Google Apps Script is not deployed correctly
3. Script has execution errors

**Solution:**
- Verify the webhook URL is accessible
- Check Google Apps Script execution logs
- Test with a simple echo script first

### Issue: Signature verification fails

**Possible causes:**
1. Secret mismatch
2. Body encoding issues
3. Timestamp format mismatch

**Solution:**
- Verify `TECH_EVENTS_WEBHOOK_SECRET` matches in both systems
- Ensure raw body is used (not parsed JSON)
- Check timestamp format matches expected format

## Environment Variables

All required configuration in `.env`:

```env
# Required for authentication
CRON_SECRET=cron12345678

# Webhook configuration
TECH_EVENTS_WEBHOOK_ENABLED=true
TECH_EVENTS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
TECH_EVENTS_WEBHOOK_SECRET=bot12345678
```

## Security Notes

1. **Protect the endpoint:** Always require `x-cron-secret` header
2. **Use HTTPS:** In production, ensure webhook URL uses HTTPS
3. **Rotate secrets:** Periodically rotate `CRON_SECRET` and webhook secret
4. **Monitor usage:** Check logs for unauthorized test attempts

## Example: Complete Test Script

Create a test script `test-webhook.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
CRON_SECRET="cron12345678"

echo "Testing Tech Events Webhook..."
echo ""

# Send test request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/integrations/tech-events/test" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: ${CRON_SECRET}")

# Extract HTTP code and body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo ""
echo "Response:"
echo "$BODY" | jq .

# Check success
if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "✅ Test webhook sent successfully!"
else
  echo ""
  echo "❌ Test failed with status $HTTP_CODE"
fi
```

Run it:
```bash
chmod +x test-webhook.sh
./test-webhook.sh
```
