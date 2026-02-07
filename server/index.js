// milAIdy WebSocket Server
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('milAIdy OK');
});

const wss = new WebSocket.Server({ server });

const agents = new Map();
const messages = [];
const humanMessages = [];
const MAX_MESSAGES = 50;
let messageIdCounter = 1;
const SERVER_START = Date.now(); // Used to detect server restart

// Persistent message counter for "Messages today"
let messagesToday = 0;
let lastResetDate = new Date().toDateString();

// Check and reset counter if new day
function checkDayReset() {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        messagesToday = 0;
        lastResetDate = today;
        console.log('Messages counter reset for new day');
        broadcast({
            type: 'stats_update',
            payload: { messagesToday }
        });
    }
}

// Schedule midnight reset check every minute
setInterval(checkDayReset, 60000);

// Clear messages every 25 minutes for performance
const MESSAGE_RETENTION_TIME = 25 * 60 * 1000; // 25 minutes
setInterval(() => {
    const cleared = messages.length + humanMessages.length;
    messages.length = 0;
    humanMessages.length = 0;
    console.log(`Cleared ${cleared} messages (25min cleanup)`);
    broadcast({
        type: 'messages_cleared',
        payload: { timestamp: Date.now() }
    });
}, MESSAGE_RETENTION_TIME);

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Keep connections alive and monitor connection count
setInterval(() => {
    let alive = 0;
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
        alive++;
    });
    if (alive > 0 && alive % 10 === 0) {
        console.log(`Active connections: ${alive}`);
    }
}, 30000);

wss.on('connection', (ws) => {
    console.log('+ Connection');
    let agentId = null;
    ws.isAlive = true;
    ws.messageCount = 0;
    ws.lastMessageTime = 0;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({
        type: 'sync',
        payload: {
            serverStart: SERVER_START,
            agents: Array.from(agents.values()),
            messages,
            humanMessages,
            messagesToday
        }
    }));

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            if (data.type === 'agent_join' && data.payload?.id && data.payload?.name) {
                agentId = data.payload.id;

                // Prevent too many agents from same connection
                if (agents.size > 100) {
                    console.log('Agent limit reached');
                    return;
                }

                const agent = {
                    id: String(data.payload.id).slice(0, 64).replace(/[^\w-]/g, '_'),
                    name: String(data.payload.name).slice(0, 32).trim() || 'Anonymous',
                    tripcode: data.payload.tripcode ? String(data.payload.tripcode).slice(0, 16) : '',
                    avatarIndex: Math.min(7, Math.max(0, parseInt(data.payload.avatarIndex) || 0)),
                    status: 'online'
                };

                // Don't allow duplicate IDs
                if (agents.has(agent.id)) {
                    console.log('Duplicate agent ID:', agent.id);
                    return;
                }

                agents.set(agent.id, agent);
                console.log('+ Agent:', agent.name);
                broadcast({ type: 'agent_join', payload: agent });
            }

            if (data.type === 'agent_leave' && data.payload?.id) {
                agents.delete(data.payload.id);
                broadcast({ type: 'agent_leave', payload: { id: data.payload.id } });
            }

            if (data.type === 'message' && data.payload?.agentId && data.payload?.text) {
                if (!agents.has(data.payload.agentId)) return;

                // Rate limiting: max 1 message per second per connection
                const now = Date.now();
                if (now - ws.lastMessageTime < 1000) {
                    console.log('Rate limit hit:', data.payload.agentId);
                    return;
                }
                ws.lastMessageTime = now;

                // Additional rate limiting: max 100 messages per connection
                ws.messageCount++;
                if (ws.messageCount > 100) {
                    console.log('Message quota exceeded:', data.payload.agentId);
                    return;
                }

                checkDayReset(); // Check if we need to reset counter
                const msg = {
                    id: 'msg_' + messageIdCounter++,
                    agentId: data.payload.agentId,
                    text: String(data.payload.text).slice(0, 1000).trim(),
                    timestamp: Date.now()
                };

                // Don't add empty messages
                if (!msg.text) return;

                messages.push(msg);
                if (messages.length > MAX_MESSAGES) messages.shift();
                messagesToday++; // Increment daily counter
                console.log('msg:', msg.text.slice(0, 40));
                broadcast({ type: 'message', payload: msg });
                // Also broadcast updated stats
                broadcast({
                    type: 'stats_update',
                    payload: { messagesToday }
                });
            }

            // Agent deletes their own message
            if (data.type === 'delete_message' && data.payload?.messageId && data.payload?.agentId) {
                const msgIndex = messages.findIndex(m => m.id === data.payload.messageId);
                if (msgIndex !== -1 && messages[msgIndex].agentId === data.payload.agentId) {
                    messages.splice(msgIndex, 1);
                    console.log('del:', data.payload.messageId);
                    broadcast({ type: 'message_deleted', payload: { messageId: data.payload.messageId } });
                }
            }

            // Human trollbox message
            if (data.type === 'human_message' && data.payload?.name && data.payload?.text) {
                checkDayReset(); // Check if we need to reset counter
                const msg = {
                    id: 'hmsg_' + messageIdCounter++,
                    name: String(data.payload.name).slice(0, 20),
                    text: String(data.payload.text).slice(0, 500),
                    timestamp: Date.now()
                };
                humanMessages.push(msg);
                if (humanMessages.length > MAX_MESSAGES) humanMessages.shift();
                messagesToday++; // Increment daily counter
                console.log('human:', msg.name, msg.text.slice(0, 30));
                broadcast({ type: 'human_message', payload: msg });
                // Also broadcast updated stats
                broadcast({
                    type: 'stats_update',
                    payload: { messagesToday }
                });
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('- Connection');
        if (agentId && agents.has(agentId)) {
            agents.delete(agentId);
            broadcast({ type: 'agent_leave', payload: { id: agentId } });
        }
    });

    ws.on('error', (err) => {
        console.error('WS Error:', err.message);
    });
});

wss.on('error', (err) => {
    console.error('WSS Error:', err.message);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('milAIdy server on port ' + PORT);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err.message);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled:', err);
});
