import express from 'express';
import { chatHistory, generateChatMessageId, normalizeAttachments } from '../helpers/chat.js';

const router = express.Router();

// Retrieve chat history for a room
router.get('/chat/history', (req, res) => {
  const { roomName } = req.query;

  if (!roomName || typeof roomName !== 'string') {
    return res.status(400).json({ error: 'roomName query parameter is required' });
  }

  const messages = chatHistory.get(roomName) || [];
  return res.json(messages);
});

// Persist a new chat message
router.post('/chat/messages', (req, res) => {
  const { roomName, senderIdentity, senderName, text, attachments } = req.body || {};

  if (!roomName || !senderIdentity || !senderName) {
    return res.status(400).json({
      error: 'roomName, senderIdentity, and senderName are required',
    });
  }

  const timestamp = Date.now();
  const id = generateChatMessageId(roomName, senderIdentity);

  const message = {
    id,
    roomName,
    senderIdentity,
    senderName,
    text: text || '',
    timestamp,
    attachments: normalizeAttachments(attachments),
  };

  const existing = chatHistory.get(roomName) || [];
  existing.push(message);
  chatHistory.set(roomName, existing);

  return res.status(201).json(message);
});

export default router;
