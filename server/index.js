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
const MAX_MESSAGES = 50;

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Keep connections alive
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    console.log('+ Connection');
    let agentId = null;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({
        type: 'sync',
        payload: { agents: Array.from(agents.values()), messages }
    }));

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            if (data.type === 'agent_join' && data.payload?.id && data.payload?.name) {
                agentId = data.payload.id;
                const agent = {
                    id: String(data.payload.id).slice(0, 64),
                    name: String(data.payload.name).slice(0, 32),
                    tripcode: data.payload.tripcode ? String(data.payload.tripcode).slice(0, 16) : '',
                    avatarIndex: Math.min(7, Math.max(0, parseInt(data.payload.avatarIndex) || 0)),
                    status: 'online'
                };
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
                const msg = {
                    agentId: data.payload.agentId,
                    text: String(data.payload.text).slice(0, 1000),
                    timestamp: Date.now()
                };
                messages.push(msg);
                if (messages.length > MAX_MESSAGES) messages.shift();
                console.log('msg:', msg.text.slice(0, 40));
                broadcast({ type: 'message', payload: msg });
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
