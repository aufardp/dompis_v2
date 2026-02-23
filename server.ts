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

app.prepare().then(() => {
  console.log('Next.js app prepared');

  if (!dev) {
    cron.schedule('*/5 * * * *', () => {
      console.log('[CRON] Running sync every 5 minutes...');
      triggerSync();
    });

    cron.schedule('*/10 * * * *', () => {
      console.log('[CRON] Running push every 10 minutes...');
      triggerPush();
    });

    console.log('[CRON] Scheduled: sync every 5 min, push every 10 min');
  }

  createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
