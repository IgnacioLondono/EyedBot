const { WebSocketServer, WebSocket } = require('ws');

const WS_PATH = '/api/community/party-ws';
const HEARTBEAT_MS = 30_000;
const MESSAGE_WINDOW_MS = 10_000;
const MESSAGE_LIMIT = 20;

function attachPartyWebSocket(httpServer, partyService) {
    if (!httpServer || httpServer.__eyedPartyWs) return httpServer?.__eyedPartyWs || null;
    const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    const rooms = new Map();
    const userRateWindows = new Map();

    function remove(client) {
        const room = rooms.get(client.partyId);
        room?.delete(client);
        if (room?.size === 0) rooms.delete(client.partyId);
        const stillConnected = [...wss.clients].some((candidate) => (
            candidate !== client
            && candidate.readyState === WebSocket.OPEN
            && candidate.guildId === client.guildId
            && candidate.userId === client.userId
        ));
        if (!stillConnected) userRateWindows.delete(`${client.guildId}:${client.userId}`);
    }

    function broadcast(partyId, payload) {
        const encoded = JSON.stringify(payload);
        for (const client of rooms.get(String(partyId)) || []) {
            if (client.readyState === WebSocket.OPEN && client.authenticated === true) {
                client.send(encoded);
            }
        }
    }

    function disconnect(partyId, userId, code = 1008, reason = 'party_access_revoked') {
        for (const client of rooms.get(String(partyId)) || []) {
            if (String(client.userId) !== String(userId)) continue;
            client.close(code, reason);
        }
    }

    function disconnectUser(guildId, userId, code = 1008, reason = 'guild_access_revoked') {
        for (const client of wss.clients) {
            if (String(client.guildId) !== String(guildId) || String(client.userId) !== String(userId)) continue;
            client.close(code, reason);
        }
    }

    httpServer.on('upgrade', (request, socket, head) => {
        let parsed;
        try {
            parsed = new URL(request.url, 'http://localhost');
        } catch {
            socket.destroy();
            return;
        }
        if (parsed.pathname !== WS_PATH) return;
        const ticket = String(parsed.searchParams.get('ticket') || '');
        if (ticket.length < 20 || ticket.length > 200) {
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }
        partyService.consumeTicket(ticket).then((identity) => {
            if (!identity || socket.destroyed) {
                socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (client) => {
                client.partyId = identity.partyId;
                client.guildId = identity.guildId;
                client.userId = identity.userId;
                client.authenticated = true;
                client.isAlive = true;
                wss.emit('connection', client);
            });
        }).catch(() => {
            if (!socket.destroyed) {
                socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
                socket.destroy();
            }
        });
    });

    wss.on('connection', (client) => {
        if (!rooms.has(client.partyId)) rooms.set(client.partyId, new Set());
        rooms.get(client.partyId).add(client);
        client.on('pong', () => { client.isAlive = true; });
        client.on('close', () => remove(client));
        client.on('error', () => remove(client));
        client.on('message', (raw) => {
            const now = Date.now();
            const rateKey = `${client.guildId}:${client.userId}`;
            const messageTimes = (userRateWindows.get(rateKey) || [])
                .filter((time) => now - time < MESSAGE_WINDOW_MS);
            if (messageTimes.length >= MESSAGE_LIMIT) {
                client.close(1008, 'rate_limited');
                return;
            }
            messageTimes.push(now);
            userRateWindows.set(rateKey, messageTimes);
            let message;
            try {
                message = JSON.parse(raw.toString('utf8'));
            } catch {
                client.close(1007, 'invalid_json');
                return;
            }
            if (message?.type === 'ping') {
                client.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
            }
        });
        partyService.get(client.guildId, client.partyId, client.userId)
            .then((party) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'party.snapshot', party }));
                }
            })
            .catch(() => client.close(1008, 'party_unavailable'));
    });

    const heartbeat = setInterval(() => {
        for (const client of wss.clients) {
            if (client.isAlive === false) {
                client.terminate();
                continue;
            }
            client.isAlive = false;
            client.ping();
        }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    wss.on('close', () => clearInterval(heartbeat));

    const api = { wss, broadcast, disconnect, disconnectUser, close: () => wss.close() };
    httpServer.__eyedPartyWs = api;
    return api;
}

module.exports = { WS_PATH, attachPartyWebSocket };
