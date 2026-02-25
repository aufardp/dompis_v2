import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import 'dotenv/config';
import cron from 'node-cron';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function triggerSync() {
  try {
    const baseUrl = process.env.CRON_BASE_URL || `http://localhost:${port}`;
    const res = await fetch(`${baseUrl}/api/sync`);
    const data = await res.json();
    console.log(`[CRON] Sync result:`, data);
  } catch (error) {
    console.error('[CRON] Sync error:', error);
  }
}

async function triggerPush() {
  try {
    const baseUrl = process.env.CRON_BASE_URL || `http://localhost:${port}`;
    const res = await fetch(`${baseUrl}/api/push`);
    const data = await res.json();
    console.log(`[CRON] Push result:`, data);
  } catch (error) {
    console.error('[CRON] Push error:', error);
  }
}

async function triggerTechEventsDispatch() {
  try {
    const baseUrl = process.env.CRON_BASE_URL || `http://localhost:${port}`;
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.warn('[CRON] CRON_SECRET not set, skipping tech events dispatch');
      return;
    }

    const res = await fetch(
      `${baseUrl}/api/integrations/tech-events/dispatch`,
      {
        method: 'POST',
        headers: {
          'x-cron-secret': cronSecret,
        },
      },
    );
    const data = await res.json().catch(() => null);
    console.log(`[CRON] Tech events dispatch:`, { status: res.status, data });
  } catch (error) {
    console.error('[CRON] Tech events dispatch error:', error);
  }
}

app.prepare().then(() => {
  console.log('Next.js app prepared');

  const cronEnabled = process.env.CRON_ENABLED === 'true' || !dev;

  if (cronEnabled) {
    cron.schedule('*/5 * * * *', () => {
      console.log('[CRON] Running sync every 5 minutes...');
      triggerSync();
    });

    cron.schedule('*/10 * * * *', () => {
      console.log('[CRON] Running push every 10 minutes...');
      triggerPush();
    });

    cron.schedule('* * * * *', () => {
      triggerTechEventsDispatch();
    });

    console.log(
      '[CRON] Scheduled: sync every 5 min, push every 10 min, tech events dispatch every 1 min',
    );
  } else {
    console.log('[CRON] Disabled (set CRON_ENABLED=true to enable)');
  }

  createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
