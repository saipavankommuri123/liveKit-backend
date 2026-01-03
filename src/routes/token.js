import express from 'express';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { API_KEY, API_SECRET } from '../config/livekit.js';
import { checkStudentEnrollment } from '../services/enrollmentService.js';

const router = express.Router();

router.post('/token', async (req, res) => {
  const { room, identity, metadata } = req.body;
  console.log('Received token request for room:', room, 'identity:', identity);
  
  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity are required' });
  }
  
  try {
    const meta = metadata ? JSON.parse(metadata) : {};
    const role = String(meta.role || '').toUpperCase();
    const email = String(meta.email || '');
    const courseId = String(meta.courseId || '');
    const isInstructor = role === 'INSTRUCTOR' || role === 'INSTITUTE';
    const isStudent = role === 'STUDENT';

    // Validate student enrollment
    if (isStudent) {
      if (!email || !courseId) {
        return res.status(400).json({ 
          error: 'email and courseId are required for students' 
        });
      }

      const isEnrolled = await checkStudentEnrollment(email, courseId);
      if (!isEnrolled) {
        return res.status(403).json({ 
          error: 'Student is not enrolled in this course',
          message: 'Access denied: You must be enrolled in this course to join the session.'
        });
      }
    }

    const at = new AccessToken(API_KEY, API_SECRET, { identity, metadata });

    const grant = {
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublishData: true,
      roomRecord: isInstructor, // Only instructors can control recording
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

export default router;
