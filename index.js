import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.LK_API_KEY || 'devkey';
const API_SECRET = process.env.LK_API_SECRET || 'secret';

app.post('/token', async (req, res) => {
  console.log('Received request:', req.body);
  const { room, identity } = req.body;
  if (!room || !identity) {
    console.log('Missing room or identity');
    return res.status(400).json({ error: 'room and identity are required' });
  }
  try {
    const at = new AccessToken(API_KEY, API_SECRET, { identity });
    at.addGrant({ roomJoin: true, room });
    const token = await at.toJwt();
    console.log('Token generated successfully');
    console.log('Token type:', typeof token);
    console.log('Token value:', token);
    return res.json({ token: String(token) });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('LiveKit Node backend is running.');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LiveKit backend listening on port ${PORT}`);
});
