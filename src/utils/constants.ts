/**
 * Shared constants used across the application.
 */

/**
 * Time constants (in milliseconds)
 */
export const THIRTY_MINUTES_MS = 30 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const SIX_SECONDS_MS = 6000;

/**
 * User data cleanup settings
 */
export const TTL_MS = HOUR_MS; // 1 hour
export const SWEEP_MS = TEN_MINUTES_MS; // 10 minutes

/**
 * Rate limiting settings
 */
export const CAPACITY = 5; // tokens per user
export const REFILL_MS_PER_TOKEN = SIX_SECONDS_MS; // 6 seconds between tokens
