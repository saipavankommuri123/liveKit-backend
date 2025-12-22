import { AccessToken } from 'livekit-server-sdk';

const API_KEY = 'devkey';
const API_SECRET = 'secret';

const at = new AccessToken(API_KEY, API_SECRET, { identity: 'test-user' });
at.addGrant({ roomJoin: true, room: 'test-room' });

console.log('AccessToken object:', at);
console.log('\nCalling toJwt()...');

const token = await at.toJwt();

console.log('Token type:', typeof token);
console.log('Token value:', token);
console.log('Token is Promise?', token instanceof Promise);
console.log('Token constructor:', token.constructor.name);
