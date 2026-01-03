import dotenv from 'dotenv';
import app from './src/app.js';
import { LIVEKIT_URL, EGRESS_REQUEST_TIMEOUT, EGRESS_CLEANUP_INTERVAL_MS, MAX_EGRESS_DURATION_MINUTES } from './src/config/livekit.js';
import { cleanupStaleRecordings } from './src/services/recordingService.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LiveKit backend listening on port ${PORT}`);
  console.log(`Egress client pointing at ${LIVEKIT_URL.replace('ws', 'http')} with timeout ${EGRESS_REQUEST_TIMEOUT}s`);
  console.log(`Egress cleanup job running every ${Math.round(EGRESS_CLEANUP_INTERVAL_MS / 60000)} minutes; max duration ${MAX_EGRESS_DURATION_MINUTES} minutes.`);

  // Start periodic cleanup of stale/idle recordings
  setInterval(cleanupStaleRecordings, EGRESS_CLEANUP_INTERVAL_MS);

  // Optionally run once on startup
  cleanupStaleRecordings().catch((err) => console.error('[cleanup] Initial run failed:', err));
});
