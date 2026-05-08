# Cloudflare Configuration Guide

## Domain: dompis.telkomakses-area3.id

---

## 1. Cache Rules (Page Rules or Rules)

Create these rules in **Cloudflare Dashboard → Rules → Cache Rules**:

### Rule 1: Static Assets — Long Cache

| Field | Value |
|-------|-------|
| **Name** | `Static Assets Cache` |
| **URL pattern** | `dompis.telkomakses-area3.id/_next/static/*` |
| **Cache eligibility** | Eligible for cache |
| **Edge TTL** | 1 year (31536000 seconds) |
| **Browser TTL** | 1 year |
| **Origin TTL** | Respect origin headers |
| **Cache key** | Include all URL query strings (default) |

### Rule 2: HTML Pages — Bypass Cache

| Field | Value |
|-------|-------|
| **Name** | `HTML No Cache` |
| **URL pattern** | `dompis.telkomakses-area3.id/*.html` |
| **Cache eligibility** | Not eligible for cache |
| **Edge TTL** | 0 |
| **Browser TTL** | 0 |
| **Origin TTL** | 0 |

### Rule 3: API Routes — Bypass Cache

| Field | Value |
|-------|-------|
| **Name** | `API No Cache` |
| **URL pattern** | `dompis.telkomakses-area3.id/api/*` |
| **Cache eligibility** | Not eligible for cache |
| **Edge TTL** | 0 |
| **Browser TTL** | 0 |
| **Origin TTL** | 0 |

### Rule 4: SSE Endpoint — No Cache

| Field | Value |
|-------|-------|
| **Name** | `SSE No Cache` |
| **URL pattern** | `dompis.telkomakses-area3.id/api/tickets/events` |
| **Cache eligibility** | Not eligible for cache |
| **Edge TTL** | 0 |
| **Browser TTL** | 0 |
| **Origin TTL** | 0 |

---

## 2. Speed Settings (Speed → Optimization)

| Setting | Value | Notes |
|---------|-------|-------|
| **Auto Minify** | ON (HTML, CSS, JS) | Minify code |
| **Brotli** | ON | Better compression than gzip |
| **Rocket Loader** | OFF | Can interfere with React hydration |
| **Polish** | Off | Don't auto-convert images (may break Google images) |
| ** Mirage** | OFF | May interfere with image optimization |

---

## 3. Security Settings (Security → Settings)

| Setting | Value |
|---------|-------|
| **Security Level** | Medium |
| **Bot Fight Mode** | ON (or Javascript Challenge if needed) |
| **Always Use HTTPS** | ON (SSL/TLS → Edge certificates) |

---

## 4. SSL/TLS Mode

Set to **Full** or **Full (strict)** if you have Cloudflare Origin Certificate installed.

- **Full**: Encrypts traffic from Cloudflare to origin, but origin can be self-signed cert
- **Full (strict)**: Requires valid cert on origin (recommended)

---

## 5. Caching → Configuration

| Setting | Value |
|---------|-------|
| **Browser Cache TTL** | 4 hours (orrespect existing headers) |
| **Always Online** | ON |
| **Development Mode** | OFF (only enable when debugging chunk issues) |

---

## 6. If Chunk Error Still Happens (Emergency Purge)

If after deployment you still see "Loading chunk failed":

1. **Cloudflare Dashboard → Caching → Configuration**
2. Click **Purge Everything**
3. OR selective purge: Caching → Cache Rules → delete rules → re-create

Or use Cloudflare API:
```bash
# Purge all cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

---

## 7. Network Settings

| Setting | Value |
|---------|-------|
| **HTTP/2** | ON |
| **HTTP/3 (QUIC)** | ON |
| **0-RTT** | ON |
| **WebSockets** | ON (needed for SSE) |
| **IP Geolocation** | ON |

---

## 8. Verified Brands (Optional)

Enable if you want Cloudflare to cache resources from Google Fonts, etc.

---

## Quick Checklist

- [ ] Static Assets Cache rule created (1 year TTL)
- [ ] HTML/htm bypass rule created
- [ ] API bypass rule created
- [ ] SSE bypass rule created
- [ ] Auto Minify ON (HTML, CSS, JS)
- [ ] Brotli ON
- [ ] Rocket Loader OFF
- [ ] Polish OFF
- [ ] Bot Fight Mode ON
- [ ] Always Use HTTPS ON
- [ ] SSL/TLS: Full
- [ ] Development Mode OFF
- [ ] WebSockets ON