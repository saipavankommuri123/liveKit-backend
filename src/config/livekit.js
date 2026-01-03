import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const API_KEY = process.env.LK_API_KEY || 'devkey';
export const API_SECRET = process.env.LK_API_SECRET || 'secret';
export const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
export const EGRESS_REQUEST_TIMEOUT = parseInt(process.env.EGRESS_REQUEST_TIMEOUT || '300', 10);
export const EGRESS_MIN_ACTIVE_MS = parseInt(process.env.EGRESS_MIN_ACTIVE_MS || '5000', 10);
export const MIN_EGRESS_ACTIVE_DELAY_MS = parseInt(process.env.MIN_EGRESS_ACTIVE_DELAY_MS || '3000', 10);
export const EGRESS_CLEANUP_INTERVAL_MS = parseInt(process.env.EGRESS_CLEANUP_INTERVAL_MS || String(30 * 60 * 1000), 10);
export const MAX_EGRESS_DURATION_MINUTES = parseInt(process.env.MAX_EGRESS_DURATION_MINUTES || '180', 10);

// Room service URL should be HTTP(S); convert from ws/wss if needed
export const ROOM_SERVICE_URL = LIVEKIT_URL.startsWith('ws')
  ? LIVEKIT_URL.replace(/^ws/, 'http')
  : LIVEKIT_URL;

// Initialize Egress Client for recording with extended timeout
export const egressClient = new EgressClient(LIVEKIT_URL, API_KEY, API_SECRET, {
  requestTimeout: EGRESS_REQUEST_TIMEOUT,
});

// Room service client to query room participants
export const roomService = new RoomServiceClient(ROOM_SERVICE_URL, API_KEY, API_SECRET);
