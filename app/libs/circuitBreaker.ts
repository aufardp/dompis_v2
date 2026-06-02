import { logger } from '@/lib/observability/logger';

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number;  // Failures before opening circuit
  successThreshold?: number;  // Successes in half-open before closing
  timeoutMs?: number;         // How long circuit stays open
  resetTimeoutMs?: number;    // How often to check in half-open
}

/**
 * Circuit breaker for external API calls
 * Prevents cascading failures by stopping requests to failing services
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;
  private readonly resetTimeoutMs: number;
  private readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 3;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30000;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        logger.info(`[CircuitBreaker:${this.name}] State: open -> half-open`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if we should attempt to reset from open to half-open
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.timeoutMs;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
        logger.info(`[CircuitBreaker:${this.name}] State: half-open -> closed`);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    if (this.state === 'half-open') {
      this.state = 'open';
      logger.warn(`[CircuitBreaker:${this.name}] State: half-open -> open (failure in half-open)`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      logger.warn(`[CircuitBreaker:${this.name}] State: closed -> open (threshold: ${this.failures}/${this.failureThreshold})`);
    }
  }

  /**
   * Get current state (for monitoring)
   */
  getState(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }

  /**
   * Reset circuit breaker manually
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    logger.info(`[CircuitBreaker:${this.name}] Manual reset`);
  }
}

/**
 * In-memory store for circuit breakers
 * In production, consider using Redis for distributed circuit breakers
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: CircuitBreakerConfig
): CircuitBreaker {
  let cb = circuitBreakers.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, config);
    circuitBreakers.set(name, cb);
  }
  return cb;
}

/**
 * Execute with circuit breaker
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<T> {
  const cb = getCircuitBreaker(name, config);
  return cb.execute(fn);
}

/**
 * Get all circuit breaker states (for health check)
 */
export function getAllCircuitBreakerStates(): Record<string, ReturnType<CircuitBreaker['getState']>> {
  const states: Record<string, ReturnType<CircuitBreaker['getState']>> = {};
  for (const [name, cb] of circuitBreakers) {
    states[name] = cb.getState();
  }
  return states;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const cb of circuitBreakers.values()) {
    cb.reset();
  }
}