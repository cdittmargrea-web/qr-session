require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10e6 }); // 10MB for image frames

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static('public'));

// sessions[sessionId] = { hostSocketId, phoneSocketId }
const sessions = {};

// Helper: find which session a socket belongs to (as host or phone)
function findSession(socketId) {
  for (const [sessionId, s] of Object.entries(sessions)) {
    if (s.hostSocketId === socketId || s.phoneSocketId === socketId) {
      return { sessionId, session: s };
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // iPad calls this to create a new session
  socket.on('create-session', async (baseUrl) => {
    const sessionId = uuidv4().slice(0, 8).toUpperCase();
    sessions[sessionId] = { hostSocketId: socket.id, phoneSocketId: null };
    socket.join(sessionId);

    const joinUrl = `${baseUrl}/join.html?session=${sessionId}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    socket.emit('session-created', { sessionId, qrDataUrl, joinUrl });
    console.log(`[session] Created ${sessionId} — join: ${joinUrl}`);
  });

  // Phone calls this after scanning the QR code
  socket.on('join-session', (sessionId) => {
    const session = sessions[sessionId];
    if (!session) {
      socket.emit('join-error', 'Session not found. Please scan the QR code again.');
      return;
    }
    if (session.phoneSocketId) {
      socket.emit('join-error', 'A phone is already connected to this session.');
      return;
    }

    session.phoneSocketId = socket.id;
    socket.join(sessionId);
    socket.emit('joined', { sessionId });
    io.to(session.hostSocketId).emit('phone-connected');
    console.log(`[session] Phone joined ${sessionId}`);
  });

  // Phone sends a captured frame every 30 seconds
  socket.on('frame', async ({ sessionId, imageData }) => {
    const session = sessions[sessionId];
    if (!session || !session.hostSocketId) return;

    console.log(`[frame] Received for session ${sessionId}, processing...`);
    io.to(session.hostSocketId).emit('processing', true);

    try {
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `Look at this image carefully. First, extract all the text you can see in the image exactly as written. Then treat that extracted text as a question or prompt directed at you, and give a clear, helpful, and thorough response to it. 

Format your response like this:
📝 TEXT FOUND: [the exact text from the image]

💬 RESPONSE: [your answer or response to that text]

If there is no readable text in the image, describe what you see instead and say there was no text to respond to.`,
              },
            ],
          },
        ],
      });

      const result = response.content[0].text;
      const timestamp = new Date().toLocaleTimeString();
      io.to(session.hostSocketId).emit('llm-response', { text: result, timestamp });
      console.log(`[claude] Response sent for session ${sessionId}`);
    } catch (err) {
      console.error(`[claude] Error:`, err.message);
      const errMsg = err.message.includes('API key')
        ? 'Invalid or missing ANTHROPIC_API_KEY. Check your .env file.'
        : `Claude API error: ${err.message}`;
      io.to(session.hostSocketId).emit('llm-error', errMsg);
    } finally {
      io.to(session.hostSocketId).emit('processing', false);
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const found = findSession(socket.id);
    if (!found) return;
    const { sessionId, session } = found;

    if (session.hostSocketId === socket.id) {
      // Host left — clean up entire session
      if (session.phoneSocketId) {
        io.to(session.phoneSocketId).emit('session-ended');
      }
      delete sessions[sessionId];
      console.log(`[session] Ended ${sessionId} (host left)`);
    } else if (session.phoneSocketId === socket.id) {
      // Phone left — notify host, allow reconnect
      session.phoneSocketId = null;
      io.to(session.hostSocketId).emit('phone-disconnected');
      console.log(`[session] Phone left ${sessionId}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}\n`);
});
