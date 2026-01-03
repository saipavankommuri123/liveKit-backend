import express from 'express';
import { EncodedFileType } from 'livekit-server-sdk';
import { egressClient, EGRESS_MIN_ACTIVE_MS } from '../config/livekit.js';
import { activeRecordings, getActiveEgressForRoom, waitForFileRecordingStart } from '../services/recordingService.js';

const router = express.Router();

// Start recording endpoint
router.post('/start-recording', async (req, res) => {
  try {
    const { roomName, identity } = req.body;

    if (!roomName) {
      return res.status(400).json({ error: 'roomName is required' });
    }

    // First, reconcile with LiveKit's authoritative state to avoid stale "already recording" issues.
    const livekitActive = await getActiveEgressForRoom(roomName);
    const localRecording = activeRecordings.get(roomName);

    if (livekitActive) {
      // There is already an active egress in LiveKit. Make this endpoint idempotent:
      // return success and surface existing egress info instead of hard-failing.
      if (!localRecording || localRecording.egressId !== livekitActive.egressId) {
        const now = Date.now();
        activeRecordings.set(roomName, {
          egressId: livekitActive.egressId,
          startedAt: now,
          startedBy: identity || 'unknown',
          notBeforeStopAt: now + EGRESS_MIN_ACTIVE_MS,
        });
      }

      return res.json({
        success: true,
        alreadyRecording: true,
        egressId: livekitActive.egressId,
        message: 'Recording already in progress; using existing egress.',
      });
    }

    // If LiveKit shows nothing active but we have local state, clear it as stale.
    if (localRecording && !livekitActive) {
      activeRecordings.delete(roomName);
    }

    const filepath = `/out/${roomName}/${Date.now()}.mp4`;
    console.log('Starting egress with filepath:', filepath);

    const egressInfo = await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: {
          fileType: EncodedFileType.MP4,
          filepath,
        },
      },
      {
        layout: 'grid',
        encodingOptions: {
          videoWidth: 1920,
          videoHeight: 1080,
          videoFramerate: 30,
          videoBitrate: 6000,
          audioBitrate: 128,
        },
      },
    );

    console.log(`[start-recording] Egress ${egressInfo.egressId} created, waiting for file to actually start...`);

    // Wait until LiveKit reports that the file has started writing.
    const fileStartedAtMs = await waitForFileRecordingStart(egressInfo.egressId);

    const startedAt = fileStartedAtMs || Date.now();

    activeRecordings.set(roomName, {
      egressId: egressInfo.egressId,
      startedAt,
      startedBy: identity,
      notBeforeStopAt: startedAt + EGRESS_MIN_ACTIVE_MS,
    });

    return res.json({
      success: true,
      egressId: egressInfo.egressId,
      message: 'Recording started successfully',
      recordingStartedAt: startedAt,
    });
  } catch (error) {
    console.error('Failed to start recording:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Stop recording endpoint
router.post('/stop-recording', async (req, res) => {
  const { roomName } = req.body;
  const isAsync = String(req.query.async || '').toLowerCase() === 'true';
  let recordingInfo = activeRecordings.get(roomName);

  // If we have no local state, try to recover from LiveKit directly.
  if (!recordingInfo) {
    try {
      const livekitActive = await getActiveEgressForRoom(roomName);
      if (livekitActive) {
        const now = Date.now();
        recordingInfo = {
          egressId: livekitActive.egressId,
          startedAt: now,
          startedBy: 'unknown',
          notBeforeStopAt: now + EGRESS_MIN_ACTIVE_MS,
        };
        activeRecordings.set(roomName, recordingInfo);
      }
    } catch (e) {
      console.error('[stop-recording] Failed to reconcile with LiveKit:', e);
    }
  }

  if (!recordingInfo) {
    return res.status(404).json({
      success: false,
      error: 'No active recording found for this room',
    });
  }

  // ensure a short active period before attempting to stop
  if (!isAsync && recordingInfo.notBeforeStopAt && Date.now() < recordingInfo.notBeforeStopAt) {
    const waitMs = Math.min(recordingInfo.notBeforeStopAt - Date.now(), 5000);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  console.log(`[stop-recording] Stopping egressId=${recordingInfo.egressId} for room=${roomName}, async=${isAsync}`);

  try {
    if (isAsync) {
      egressClient
        .stopEgress(recordingInfo.egressId)
        .then(() => {
          console.log(`[stop-recording] Egress ${recordingInfo.egressId} stopped.`);
          activeRecordings.delete(roomName);
        })
        .catch((e) => {
          console.error(`[stop-recording] Stop failed for ${recordingInfo.egressId}:`, e);
          if (e && (e.code === 'failed_precondition' || e.status === 412)) {
            activeRecordings.delete(roomName);
          }
        });
      return res.status(202).json({
        success: true,
        message: 'Stop signal sent. Poll status to confirm completion.',
        egressId: recordingInfo.egressId,
      });
    }

    await egressClient.stopEgress(recordingInfo.egressId);
    activeRecordings.delete(roomName);
    return res.json({
      success: true,
      message: 'Recording stopped successfully',
      duration: Math.floor((Date.now() - recordingInfo.startedAt) / 1000),
    });
  } catch (error) {
    console.error('Failed to stop recording:', error);
    if (error && (error.code === 'deadline_exceeded' || error.status === 408)) {
      return res.status(202).json({
        success: false,
        error: 'Stop request timed out; egress likely finalizing. Try again shortly or check status.',
        code: 'deadline_exceeded',
      });
    }
    if (error && (error.code === 'failed_precondition' || error.status === 412)) {
      activeRecordings.delete(roomName);
      return res.status(409).json({
        success: false,
        error: 'Egress is not in a stoppable state (already ended or failed).',
        code: 'failed_precondition',
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get recording status
router.get('/recording-status/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    let recordingInfo = activeRecordings.get(roomName);

    // First reconcile with LiveKit so a page refresh can rediscover in-progress recordings.
    const livekitActive = await getActiveEgressForRoom(roomName);

    if (!livekitActive) {
      // No active egress in LiveKit; clear any stale local entry.
      if (recordingInfo) {
        activeRecordings.delete(roomName);
      }
      return res.json({ isRecording: false });
    }

    if (!recordingInfo || recordingInfo.egressId !== livekitActive.egressId) {
      const now = Date.now();
      recordingInfo = {
        egressId: livekitActive.egressId,
        startedAt: now,
        startedBy: recordingInfo?.startedBy || 'unknown',
        notBeforeStopAt: now + EGRESS_MIN_ACTIVE_MS,
      };
      activeRecordings.set(roomName, recordingInfo);
    }

    res.json({
      isRecording: true,
      egressId: recordingInfo.egressId,
      startedAt: recordingInfo.startedAt,
      startedBy: recordingInfo.startedBy,
      duration: Math.floor((Date.now() - recordingInfo.startedAt) / 1000),
    });
  } catch (error) {
    console.error('Failed to get recording status:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all egress for a room
router.get('/egress/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const items = await egressClient.listEgress(roomName);
    res.json({ roomName, items });
  } catch (error) {
    console.error('Failed to list egress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get egress status by id
router.get('/egress-status/:egressId', async (req, res) => {
  try {
    const { egressId } = req.params;
    const items = await egressClient.listEgress();
    const match = items.find((i) => i.egressId === egressId);
    if (!match) {
      return res.status(404).json({ error: 'Egress not found' });
    }
    res.json(match);
  } catch (error) {
    console.error('Failed to get egress status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
