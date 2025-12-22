# LiveKit Node Backend

This is a simple Node.js backend for generating LiveKit access tokens for your video conferencing app.

## Features
- Express.js server
- CORS enabled
- `/token` endpoint for generating JWT tokens for LiveKit
- Uses environment variables for API key/secret

## Usage

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the server:
   ```sh
   npm run dev
   ```
   or
   ```sh
   npm start
   ```
3. Request a token:
   ```sh
   curl -X POST http://localhost:3001/token -H "Content-Type: application/json" -d '{"room":"test-room","identity":"user1"}'
   ```

## Environment Variables
- `LK_API_KEY` (default: devkey)
- `LK_API_SECRET` (default: secret)
- `PORT` (default: 3001)

## Example Request
```
POST /token
{
  "room": "test-room",
  "identity": "user1"
}
```
Response:
```
{
  "token": "<JWT token>"
}
```
