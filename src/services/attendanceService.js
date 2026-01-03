import { dbPool } from '../config/database.js';

// Persist a session attendance payload as JSON in the database.
// For a given sessionId, keep a single row and simply replace it
// with the latest payload (no server-side merging). The UI is
// responsible for sending the correct joinedAt / leftAt values.
export async function saveSessionAttendance(payload) {
  const {
    sessionId,
    roomName,
    courseId = null,
    courseName = null,
    participants = [],
  } = payload || {};

  if (!sessionId || !roomName) {
    throw new Error('sessionId and roomName are required');
  }

  const jsonData = JSON.stringify({
    sessionId,
    roomName,
    courseId,
    courseName,
    participants,
  });

  // First, try to update any existing rows for this sessionId.
  const [updateResult] = await dbPool.execute(
    `UPDATE session_attendance
     SET room_name = ?, course_id = ?, course_name = ?, data = ?
     WHERE session_id = ?`,
    [roomName, courseId, courseName, jsonData, sessionId],
  );

  // If no rows were updated, insert a new one.
  if (!updateResult || updateResult.affectedRows === 0) {
    const insertSql = `
      INSERT INTO session_attendance
        (session_id, room_name, course_id, course_name, data, created_at)
      VALUES
        (?, ?, ?, ?, ?, NOW())
    `;

    await dbPool.execute(insertSql, [
      sessionId,
      roomName,
      courseId,
      courseName,
      jsonData,
    ]);
  }
}

// Retrieve the latest session attendance record for a given sessionId
export async function getSessionAttendance(sessionId) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const sql = `
    SELECT data
    FROM session_attendance
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [rows] = await dbPool.execute(sql, [sessionId]);
  if (!rows || rows.length === 0) {
    return null;
  }

  try {
    const raw = rows[0].data;

    // If the column is a JSON type, mysql2 usually returns a JS object already.
    // Only parse when the value is a string; otherwise return it directly.
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed || null;
  } catch (e) {
    console.error('Failed to parse session attendance JSON from DB', e);
    return null;
  }
}
