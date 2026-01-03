import { dbPool } from '../config/database.js';

// Helper function to check student enrollment
export async function checkStudentEnrollment(email, courseId) {
  try {
    // First, get the userId (profile_id) from email
    const [userRows] = await dbPool.execute(
      'SELECT profile_id FROM users WHERE email = ?',
      [email]
    );

    if (userRows.length === 0) {
      console.log(`No user found with email: ${email}`);
      return false;
    }

    const userId = userRows[0].profile_id;
    console.log(`Found userId: ${userId} for email: ${email}`);

    // Now check if the student is enrolled in the course
    const [enrollRows] = await dbPool.execute(
      'SELECT enrolled FROM enroll_course WHERE student_id = ? AND course_id = ? AND enrolled = true',
      [userId, courseId]
    );
    
    return enrollRows.length > 0;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
