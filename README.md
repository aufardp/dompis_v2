This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Webhook API (For Google Apps Script Integration)

This project includes a generic webhook API that allows teammates to queue events from Google Apps Script or other external services.

### Quick Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   WEBHOOK_API_KEYS="your_api_key_1,your_api_key_2"
   TECH_EVENTS_WEBHOOK_URL="https://your-target.com/webhook"
   TECH_EVENTS_WEBHOOK_ENABLED=true
   CRON_ENABLED=true
   ```

2. Start the server (cron must be enabled for dispatch):
   ```bash
   npm run dev
   ```

### Usage from Google Apps Script

```javascript
function sendWebhook() {
  UrlFetchApp.fetch('https://your-domain.com/api/webhook/queue', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
    payload: JSON.stringify({
      eventType: 'NOTIFICATION',
      payload: { message: 'Hello!' }
    })
  });
}
```

### Documentation

- 📖 **Full API Docs:** [`docs/WEBHOOK_API.md`](docs/WEBHOOK_API.md)
- 🚀 **Quick Start:** [`docs/WEBHOOK_QUICKSTART.md`](docs/WEBHOOK_QUICKSTART.md)
- 📝 **Implementation:** [`docs/IMPLEMENTATION_SUMMARY.md`](docs/IMPLEMENTATION_SUMMARY.md)

### Testing

```bash
export TEST_WEBHOOK_API_KEY="your_api_key_1"
npm run test:webhook
```

---

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
