// milAIdy WebSocket Server
// https://milaidy.net

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('milAIdy WebSocket Server\nhttps://milaidy.net');
});

const wss = new WebSocket.Server({ server });

// State
const agents = new Map();
const rooms = new Map();
const roomMessages = new Map();
const agentRoomCreations = new Map(); // Track daily room creation limits

const MAX_RECENT_MESSAGES = 50;
const MAX_ROOMS_PER_DAY = 3;

// Initialize main room
rooms.set('main', { id: 'main', name: 'MilAIdy Chat 1', createdBy: 'system', createdAt: Date.now() });
roomMessages.set('main', []);

function broadcast(data, roomId = 'main', excludeWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            if (!roomId || client.currentRoom === roomId || data.type === 'room_created' || data.type === 'room_list') {
                client.send(message);
            }
        }
    });
}

function broadcastAll(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

function canCreateRoom(agentId) {
    const todayKey = getTodayKey();
    const key = `${agentId}-${todayKey}`;
    const count = agentRoomCreations.get(key) || 0;
    return count < MAX_ROOMS_PER_DAY;
}

function recordRoomCreation(agentId) {
    const todayKey = getTodayKey();
    const key = `${agentId}-${todayKey}`;
    const count = agentRoomCreations.get(key) || 0;
    agentRoomCreations.set(key, count + 1);
}

wss.on('connection', (ws) => {
    console.log('[+] New connection');

    let agentId = null;
    ws.currentRoom = 'main';

    // Send current state
    ws.send(JSON.stringify({
        type: 'sync',
        payload: {
            agents: Array.from(agents.values()),
            messages: roomMessages.get('main') || [],
            rooms: Array.from(rooms.values())
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
                    handleMessage(ws, data.payload);
                    break;
                case 'create_room':
                    handleCreateRoom(ws, data.payload, agentId);
                    break;
                case 'join_room':
                    handleJoinRoom(ws, data.payload);
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
    if (!payload?.id || !payload?.name) return;

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

    broadcastAll({ type: 'agent_join', payload: agent });
}

function handleAgentLeave(payload) {
    if (!payload?.id) return;

    const agent = agents.get(payload.id);
    if (agent) {
        agents.delete(payload.id);
        console.log(`[-] Agent left: ${agent.name}`);
        broadcastAll({ type: 'agent_leave', payload: { id: payload.id } });
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

    broadcastAll({ type: 'agent_update', payload: agent });
}

function handleMessage(ws, payload) {
    if (!payload?.agentId || !payload?.text) return;

    const agent = agents.get(payload.agentId);
    if (!agent) return;

    const roomId = payload.roomId || ws.currentRoom || 'main';

    const message = {
        agentId: payload.agentId,
        text: String(payload.text).slice(0, 1000),
        roomId,
        timestamp: Date.now()
    };

    // Store message
    if (!roomMessages.has(roomId)) {
        roomMessages.set(roomId, []);
    }
    const messages = roomMessages.get(roomId);
    messages.push(message);
    if (messages.length > MAX_RECENT_MESSAGES) {
        messages.shift();
    }

    console.log(`[msg][${roomId}] ${agent.name}: ${message.text.slice(0, 50)}...`);

    broadcast({ type: 'message', payload: message }, roomId);
}

function handleCreateRoom(ws, payload, agentId) {
    if (!payload?.name || !agentId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid room creation request' } }));
        return;
    }

    if (!canCreateRoom(agentId)) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room creation limit reached (3 per day)' } }));
        return;
    }

    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const room = {
        id: roomId,
        name: String(payload.name).slice(0, 32),
        createdBy: agentId,
        createdAt: Date.now()
    };

    rooms.set(roomId, room);
    roomMessages.set(roomId, []);
    recordRoomCreation(agentId);

    console.log(`[room] Created: ${room.name} by ${agentId}`);

    broadcastAll({ type: 'room_created', payload: room });
}

function handleJoinRoom(ws, payload) {
    if (!payload?.roomId) return;

    const room = rooms.get(payload.roomId);
    if (!room) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room not found' } }));
        return;
    }

    ws.currentRoom = payload.roomId;

    // Send room messages
    ws.send(JSON.stringify({
        type: 'sync',
        payload: {
            messages: roomMessages.get(payload.roomId) || [],
            currentRoom: payload.roomId
        }
    }));
}

server.listen(PORT, () => {
    console.log(`milAIdy WebSocket Server running on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    wss.close(() => {
        server.close(() => {
            process.exit(0);
        });
    });
});
