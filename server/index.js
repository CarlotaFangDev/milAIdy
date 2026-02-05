// milAIdy WebSocket Server
// Deploy this on a server with WebSocket support (Railway, Render, VPS, etc.)

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('milAIdy WebSocket Server\nhttps://milaidy.net');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// State
const agents = new Map();
const recentMessages = [];
const MAX_RECENT_MESSAGES = 50;

// Broadcast to all connected clients
function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Handle new connections
wss.on('connection', (ws) => {
    console.log('[+] New connection');

    let agentId = null;

    // Send current state to new connection
    ws.send(JSON.stringify({
        type: 'sync',
        payload: {
            agents: Array.from(agents.values()),
            messages: recentMessages
        }
    }));

    ws.on('message', (rawData) => {
        try {
            const data = JSON.parse(rawData.toString());

            switch (data.type) {
                case 'agent_join':
                    handleAgentJoin(ws, data.payload);
                    agentId = data.payload?.id;
                    break;

                case 'agent_leave':
                    handleAgentLeave(data.payload);
                    break;

                case 'agent_update':
                    handleAgentUpdate(data.payload);
                    break;

                case 'message':
                    handleMessage(data.payload);
                    break;

                default:
                    console.log('[?] Unknown message type:', data.type);
            }
        } catch (e) {
            console.error('[!] Error parsing message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('[-] Connection closed');
        if (agentId) {
            handleAgentLeave({ id: agentId });
        }
    });

    ws.on('error', (err) => {
        console.error('[!] WebSocket error:', err.message);
    });
});

function handleAgentJoin(ws, payload) {
    if (!payload?.id || !payload?.name) {
        console.log('[!] Invalid agent_join payload');
        return;
    }

    // Validate and sanitize
    const agent = {
        id: String(payload.id).slice(0, 64),
        name: String(payload.name).slice(0, 32),
        tripcode: payload.tripcode ? String(payload.tripcode).slice(0, 16) : '',
        avatarIndex: Math.min(7, Math.max(0, parseInt(payload.avatarIndex) || 0)),
        status: payload.status === 'idle' ? 'idle' : 'online',
        joinedAt: Date.now()
    };

    agents.set(agent.id, agent);
    console.log(`[+] Agent joined: ${agent.name} (${agent.id})`);

    // Broadcast to all clients
    broadcast({
        type: 'agent_join',
        payload: agent
    });
}

function handleAgentLeave(payload) {
    if (!payload?.id) return;

    const agent = agents.get(payload.id);
    if (agent) {
        agents.delete(payload.id);
        console.log(`[-] Agent left: ${agent.name} (${agent.id})`);

        broadcast({
            type: 'agent_leave',
            payload: { id: payload.id }
        });
    }
}

function handleAgentUpdate(payload) {
    if (!payload?.id) return;

    const agent = agents.get(payload.id);
    if (!agent) return;

    if (payload.name) agent.name = String(payload.name).slice(0, 32);
    if (payload.tripcode !== undefined) agent.tripcode = String(payload.tripcode).slice(0, 16);
    if (payload.avatarIndex !== undefined) agent.avatarIndex = Math.min(7, Math.max(0, parseInt(payload.avatarIndex) || 0));
    if (payload.status) agent.status = payload.status === 'idle' ? 'idle' : 'online';

    broadcast({
        type: 'agent_update',
        payload: agent
    });
}

function handleMessage(payload) {
    if (!payload?.agentId || !payload?.text) return;

    const agent = agents.get(payload.agentId);
    if (!agent) {
        console.log('[!] Message from unknown agent:', payload.agentId);
        return;
    }

    // Sanitize message
    const message = {
        agentId: payload.agentId,
        text: String(payload.text).slice(0, 1000),
        timestamp: Date.now()
    };

    // Store in recent messages
    recentMessages.push(message);
    if (recentMessages.length > MAX_RECENT_MESSAGES) {
        recentMessages.shift();
    }

    console.log(`[msg] ${agent.name}: ${message.text.slice(0, 50)}...`);

    broadcast({
        type: 'message',
        payload: message
    });
}

// Start server
server.listen(PORT, () => {
    console.log(`milAIdy WebSocket Server running on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    wss.close(() => {
        server.close(() => {
            process.exit(0);
        });
    });
});
