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

/**
 * Twilio constants
 */
export const TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
export const TWILIO_QUICKREPLY2_SID = 'HXd3617403bdef70f5979d498fcfb82165';
export const TWILIO_QUICKREPLY3_SID = 'HX60e62906ce18d4b64ac6d214fac74d8a';

/**
 * Media links
 */
export const WELCOME_IMAGE_URL = 'https://res.cloudinary.com/dn3g1tzq1/image/upload/v1755066077/photo.png';

/**
 * List of services
 */
export const SERVICES = [
  {
    text: 'Vibe Check',
    id: 'vibe_check',
  },
  {
    text: 'Occasion Outfit',
    id: 'handle_occasion',
  },
  {
    text: 'Color Analysis',
    id: 'color_analysis',
  },
  {
    text: 'Outfit Inspo',
    id: 'handle_suggest',
  },
  { 
    text: 'Vacation Looks',
    id: 'handle_vacation',
  },
];