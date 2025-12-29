import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { AccessToken, EgressClient, EncodedFileType, TrackSource } from 'livekit-server-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.LK_API_KEY || 'devkey';
const API_SECRET = process.env.LK_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const EGRESS_REQUEST_TIMEOUT = parseInt(process.env.EGRESS_REQUEST_TIMEOUT || '300', 10); // seconds
const EGRESS_MIN_ACTIVE_MS = parseInt(process.env.EGRESS_MIN_ACTIVE_MS || '5000', 10); // min duration before allow stop
const MIN_EGRESS_ACTIVE_DELAY_MS = parseInt(process.env.MIN_EGRESS_ACTIVE_DELAY_MS || '3000', 10); // wait before allowing stop

// Initialize Egress Client for recording with extended timeout (stopping can take time)
const egressClient = new EgressClient(LIVEKIT_URL, API_KEY, API_SECRET, {
  requestTimeout: EGRESS_REQUEST_TIMEOUT,
});

// Store active recordings (in production, use a database)
const activeRecordings = new Map();

app.post('/token', async (req, res) => {
  const { room, identity, metadata } = req.body;
  console.log('Received token request for room:', room, 'identity:', identity);
  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity are required' });
  }
  try {
    const meta = metadata ? JSON.parse(metadata) : {};
    const role = String(meta.role || '').toUpperCase();
    const isInstructor = role === 'INSTRUCTOR' || role === 'INSTITUTE';
    const isStudent = role === 'STUDENT';

    const at = new AccessToken(API_KEY, API_SECRET, { identity, metadata });

    const grant = {
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublishData: true,
      roomRecord: isInstructor, // Only instructors can control recording
      // Keep canPublish for backward compatibility; explicitly set sources below
      canPublish: true,
    };

    // Explicitly allow publish sources based on role
    if (isInstructor) {
      grant.canPublishSources = [
        TrackSource.MICROPHONE,
        TrackSource.CAMERA,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ];
    } else if (isStudent) {
      grant.canPublishSources = [
        TrackSource.MICROPHONE,
        TrackSource.CAMERA,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ];
    } else {
      // Default policy for other roles: allow mic + camera
      grant.canPublishSources = [
        TrackSource.MICROPHONE,
        TrackSource.CAMERA,
      ];
    }

    at.addGrant(grant);

    const token = await at.toJwt();
    return res.json({ token: String(token) });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
});

// Start recording endpoint
app.post('/start-recording', async (req, res) => {
  try {
    const { roomName, identity } = req.body;

    if (!roomName) {
      return res.status(400).json({ error: 'roomName is required' });
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

    const now = Date.now();
    activeRecordings.set(roomName, {
      egressId: egressInfo.egressId,
      startedAt: now,
      startedBy: identity,
      notBeforeStopAt: now + EGRESS_MIN_ACTIVE_MS,
    });

    return res.json({
      success: true,
      egressId: egressInfo.egressId,
      message: 'Recording started successfully',
    });
  } catch (error) {
    console.error('Failed to start recording:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


//Stop recording endpoint (simplified)
app.post('/stop-recording', async (req, res) => {
  const { roomName } = req.body;
  const isAsync = String(req.query.async || '').toLowerCase() === 'true';

  const recordingInfo = activeRecordings.get(roomName);
  if (!recordingInfo) {
    return res.status(404).json({
      success: false,
      error: 'No active recording found for this room',
    });
  }

  // ensure a short active period before attempting to stop (avoids early-stop during pipeline init)
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

app.get('/recording-status/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const recordingInfo = activeRecordings.get(roomName);
    
    if (!recordingInfo) {
      return res.json({ isRecording: false });
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
app.get('/egress/:roomName', async (req, res) => {
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
app.get('/egress-status/:egressId', async (req, res) => {
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

app.get('/', (req, res) => {
  res.send('LiveKit Node backend is running.');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LiveKit backend listening on port ${PORT}`);
  console.log(`Egress client pointing at ${LIVEKIT_URL.replace('ws', 'http')} with timeout ${EGRESS_REQUEST_TIMEOUT}s`);
});
