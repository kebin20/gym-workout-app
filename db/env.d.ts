declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GOOGLE_SHEETS_WEBHOOK_URL?: string;
    GOOGLE_SHEETS_SYNC_TOKEN?: string;
  }
}
