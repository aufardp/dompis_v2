import { prisma, connectDB } from './prisma';
import { logger } from '@/lib/observability/logger';

export interface DBHealthStatus {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  lastCheck: Date;
  reconnectAttempts?: number;
}

let healthCheckInterval: NodeJS.Timeout | null = null;
let lastHealthStatus: DBHealthStatus = {
  healthy: false,
  lastCheck: new Date(),
};

const DEFAULT_INTERVAL_MS = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Perform a database health check
 */
export async function checkDatabaseHealth(): Promise<DBHealthStatus> {
  const start = Date.now();
  
  try {
    // Simple query to check connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const latencyMs = Date.now() - start;
    
    lastHealthStatus = {
      healthy: true,
      latencyMs,
      lastCheck: new Date(),
    };
    
    return lastHealthStatus;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('[DBHealth] Check failed', { error: errorMessage });
    
    lastHealthStatus = {
      healthy: false,
      error: errorMessage,
      lastCheck: new Date(),
    };
    
    return lastHealthStatus;
  }
}

/**
 * Attempt to reconnect to database
 */
async function attemptReconnect(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      logger.info(`[DBHealth] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
      
      // Disconnect first
      await prisma.$disconnect();
      
      // Reconnect
      await connectDB();
      
      // Verify connection
      await prisma.$queryRaw`SELECT 1`;
      
      logger.info('[DBHealth] Reconnection successful');
      return true;
    } catch (error) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      logger.warn(`[DBHealth] Reconnect failed, retrying in ${delay}ms`, {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

/**
 * Health check with auto-reconnect
 */
export async function checkAndRepairDatabase(): Promise<DBHealthStatus> {
  const health = await checkDatabaseHealth();
  
  if (!health.healthy) {
    logger.warn('[DBHealth] Database unhealthy, attempting reconnect...');
    
    const reconnected = await attemptReconnect();
    
    if (reconnected) {
      // Verify again
      const verifyHealth = await checkDatabaseHealth();
      return {
        ...verifyHealth,
        reconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      };
    }
    
    return {
      ...health,
      reconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      error: 'Failed to reconnect after ' + MAX_RECONNECT_ATTEMPTS + ' attempts',
    };
  }
  
  return health;
}

/**
 * Start periodic health checks
 */
export function startDatabaseHealthCheck(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (healthCheckInterval) {
    logger.warn('[DBHealth] Health check already running');
    return;
  }
  
  logger.info(`[DBHealth] Starting periodic health checks (interval: ${intervalMs}ms)`);
  
  // Run initial check
  checkAndRepairDatabase();
  
  // Set up periodic checks
  healthCheckInterval = setInterval(async () => {
    await checkAndRepairDatabase();
  }, intervalMs);
  
  // Don't keep process alive in production
  if (process.env.NODE_ENV !== 'production') {
    healthCheckInterval.unref();
  }
}

/**
 * Stop periodic health checks
 */
export function stopDatabaseHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('[DBHealth] Stopped periodic health checks');
  }
}

/**
 * Get last health status (for monitoring endpoints)
 */
export function getLastHealthStatus(): DBHealthStatus {
  return lastHealthStatus;
}

/**
 * Manual trigger for health check (for monitoring endpoints)
 */
export async function triggerHealthCheck(): Promise<DBHealthStatus> {
  return checkAndRepairDatabase();
}