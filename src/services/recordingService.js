import { egressClient, roomService, EGRESS_MIN_ACTIVE_MS, MAX_EGRESS_DURATION_MINUTES } from '../config/livekit.js';

// Store active recordings (in production, use a database)
export const activeRecordings = new Map();

// Helper: find an active egress for a room from LiveKit (authoritative state)
export async function getActiveEgressForRoom(roomName) {
  const items = await egressClient.listEgress(roomName);
  if (!Array.isArray(items) || items.length === 0) return null;

  // LiveKit egress entries have an `endedAt` timestamp once finished.
  // Treat any item without `endedAt` (or with it falsy/0) as still active.
  return items.find((item) => !item.endedAt) || null;
}

// Helper: wait until LiveKit reports that the recording file has actually started
// Returns the file start time in ms since epoch (derived from LiveKit's nanosecond timestamp), or null on timeout.
export async function waitForFileRecordingStart(egressId, maxWaitMs = 30000, pollIntervalMs = 300) {
  const startTime = Date.now();
  let lastStatus = null;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const allEgress = await egressClient.listEgress();
      const egress = allEgress.find((e) => e.egressId === egressId);

      if (!egress) {
        throw new Error('Egress not found');
      }

      // Primary: file.startedAt – when the recording file actually begins writing
      if (egress.file && egress.file.startedAt && egress.file.startedAt > 0) {
        const elapsed = Date.now() - startTime;
        const fileStartedAtMs = Number(egress.file.startedAt) / 1e6;
        console.log(`[waitForFileRecordingStart] Egress ${egressId} file.startedAt detected after ${elapsed}ms (ns=${egress.file.startedAt})`);
        return fileStartedAtMs;
      }

      // Fallback: fileResults[0].startedAt
      if (Array.isArray(egress.fileResults) && egress.fileResults.length > 0) {
        const fr = egress.fileResults[0];
        if (fr.startedAt && fr.startedAt > 0) {
          const elapsed = Date.now() - startTime;
          const fileStartedAtMs = Number(fr.startedAt) / 1e6;
          console.log(`[waitForFileRecordingStart] Egress ${egressId} fileResults[0].startedAt detected after ${elapsed}ms (ns=${fr.startedAt})`);
          return fileStartedAtMs;
        }
      }

      // Log status transitions for debugging
      if (egress.status !== lastStatus) {
        lastStatus = egress.status;
        const elapsed = Date.now() - startTime;
        console.log(`[waitForFileRecordingStart] Egress ${egressId} status=${egress.status} at ${elapsed}ms`);
      }

      // If egress ended or errored before file started
      if (egress.endedAt || egress.error) {
        throw new Error(`Egress ended before file started: ${egress.error || 'ended'}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (err) {
      if (err.message.includes('Egress')) {
        throw err;
      }
      console.warn(`[waitForFileRecordingStart] Error while polling egress ${egressId}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  console.warn(`[waitForFileRecordingStart] Timeout waiting for file to start for egress ${egressId} after ${maxWaitMs}ms`);
  return null;
}

// Helper: periodic cleanup of stale/idle recordings
export async function cleanupStaleRecordings() {
  try {
    const nowMs = Date.now();
    const maxDurationMs = MAX_EGRESS_DURATION_MINUTES * 60 * 1000;

    const allEgress = await egressClient.listEgress();
    if (!Array.isArray(allEgress) || allEgress.length === 0) {
      return;
    }

    for (const item of allEgress) {
      if (!item || item.endedAt || !item.roomName || !item.egressId) {
        continue; // skip finished or malformed entries
      }

      const roomName = item.roomName;

      // Check for over-max-duration egress (failsafe to avoid very long recordings)
      if (item.startedAt) {
        const startedMs = Number(item.startedAt) * 1000; // protobuf timestamps are often in seconds
        if (!Number.isNaN(startedMs) && nowMs - startedMs > maxDurationMs) {
          console.log(`[cleanup] Stopping egress ${item.egressId} in room ${roomName} due to max duration exceeded.`);
          try {
            await egressClient.stopEgress(item.egressId);
            activeRecordings.delete(roomName);
            continue;
          } catch (err) {
            console.error(`[cleanup] Failed to stop long-running egress ${item.egressId}:`, err);
          }
        }
      }

      // Check participant count; stop if room is empty
      try {
        const participants = await roomService.listParticipants(roomName);
        const count = Array.isArray(participants) ? participants.length : 0;
        if (count === 0) {
          console.log(`[cleanup] Stopping egress ${item.egressId} in room ${roomName} because room has 0 participants.`);
          try {
            await egressClient.stopEgress(item.egressId);
          } catch (err) {
            // Treat timeouts or failed-precondition as non-fatal: egress is likely finalizing or already ended.
            if (err && (err.code === 'deadline_exceeded' || err.status === 408 || err.code === 'failed_precondition' || err.status === 412)) {
              console.warn(`[cleanup] stopEgress for ${item.egressId} returned ${err.code || err.status}; treating as non-fatal.`);
            } else {
              console.error(`[cleanup] Failed to stop egress ${item.egressId}:`, err);
            }
          } finally {
            activeRecordings.delete(roomName);
          }
        }
      } catch (err) {
        console.error(`[cleanup] Failed to list participants for room ${roomName}:`, err);
      }
    }
  } catch (error) {
    console.error('[cleanup] Failed to run stale recording cleanup job:', error);
  }
}
