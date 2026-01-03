// In-memory chat storage (per room). In production, replace with a database.
// Map<roomName, LiveChatMessageDto[]>
export const chatHistory = new Map();

// Helper to generate a simple unique-ish ID for chat messages
export function generateChatMessageId(roomName, senderIdentity) {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${roomName}-${senderIdentity || 'anon'}-${Date.now()}-${rand}`;
}

// Helper to normalize and validate attachments
export function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      url: String(a.url || ''),
      type: String(a.type || ''),
      name: String(a.name || ''),
    }))
    .filter((a) => a.url); // require URL to keep
}
