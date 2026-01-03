import express from 'express';
import { saveSessionAttendance, getSessionAttendance } from '../services/attendanceService.js';

const router = express.Router();

// Save session attendance
router.post('/attendance', async (req, res) => {
  try {
    const payload = req.body || {};

    console.log('[attendance] incoming payload:', JSON.stringify(payload));

    if (!payload.sessionId || !payload.roomName) {
      return res.status(400).json({
        error: 'sessionId and roomName are required',
      });
    }

    await saveSessionAttendance(payload);
    return res.status(204).send();
  } catch (error) {
    console.error('Error saving session attendance:', error);
    return res.status(500).json({
      error: 'Failed to save session attendance',
      details: error.message,
    });
  }
});

// Fetch latest session attendance for a sessionId
router.get('/attendance/history', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const data = await getSessionAttendance(sessionId);

    if (!data) {
      return res.status(404).json({ error: 'Attendance not found for this sessionId' });
    }

    return res.json(data);
  } catch (error) {
    console.error('Error fetching session attendance:', error);
    return res.status(500).json({
      error: 'Failed to fetch session attendance',
      details: error.message,
    });
  }
});

export default router;
