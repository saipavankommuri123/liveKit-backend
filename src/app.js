import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';
import tokenRouter from './routes/token.js';
import chatRouter from './routes/chat.js';
import recordingRouter from './routes/recording.js';
import attendanceRouter from './routes/attendance.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(errorHandler);

// Routes
app.use('/', tokenRouter);
app.use('/', chatRouter);
app.use('/', recordingRouter);
app.use('/', attendanceRouter);

// Health check
app.get('/', (req, res) => {
  res.send('LiveKit Node backend is running.');
});

export default app;
