// Store for pending sessions
interface PendingSession {
  process: any;
  userEmail: string;
  outputDir: string;
  output?: string;
  errorOutput?: string;
}

declare global {
  var _pendingSessions: { [key: string]: PendingSession };
}

if (!global._pendingSessions) {
  global._pendingSessions = {};
}

export const pendingSessions = global._pendingSessions;
