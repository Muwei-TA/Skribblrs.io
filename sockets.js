const socketio = require('socket.io');
const Room = require('./controllers/Rooms');
const Canvas = require('./controllers/Canvas');
const Disconnect = require('./controllers/Disconnect');
const Game = require('./controllers/Game');
const { GameError } = require('./controllers/validation');

function consume(buckets, key, capacity, perSecond) {
    const now = Date.now();
    const bucket = buckets.get(key) || { tokens: capacity, time: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.time) / 1000) * perSecond);
    bucket.time = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens--;
    buckets.set(key, bucket);
    return allowed;
}

module.exports.init = (server) => {
    const io = socketio(server, {
        maxHttpBufferSize: 16 * 1024,
        allowRequest: (req, callback) => callback(null, io.engine.clientsCount < 300),
    });
    io.on('connection', (socket) => {
        const buckets = new Map();
        const guard = (event, handler, capacity = 30, rate = 10) => {
            socket.on(event, async (data, acknowledge) => {
                try {
                    if (!consume(buckets, 'total', 180, 120) || !consume(buckets, event, capacity, rate)) {
                        throw new GameError('RATE_LIMITED', '操作过于频繁，请稍后重试');
                    }
                    const result = await handler(data);
                    if (typeof acknowledge === 'function') acknowledge({ ok: true, data: result });
                } catch (error) {
                    const response = error instanceof GameError
                        ? { ok: false, code: error.code, message: error.message }
                        : { ok: false, code: 'INTERNAL_ERROR', message: '操作失败，请重试' };
                    if (!(error instanceof GameError)) console.error(`Socket event failed: ${event}`);
                    if (typeof acknowledge === 'function') acknowledge(response);
                    if (consume(buckets, 'errors', 3, 1)) socket.emit('operationError', { event, ...response });
                }
            });
        };
        const room = new Room(io, socket);
        const game = new Game(io, socket);
        const canvas = new Canvas(io, socket);
        guard('newPrivateRoom', (data) => room.createPrivateRoom(data), 3, 0.1);
        guard('joinRoom', (data) => room.joinRoom(data), 10, 1);
        guard('settingsUpdate', (data) => room.updateSettings(data));
        guard('startGame', () => game.startGame());
        guard('returnToLobby', () => game.returnToLobby(), 3, 1);
        guard('getPlayers', () => game.getPlayers());
        guard('chooseWord', (data) => game.chooseWord(data));
        guard('drawing', (data) => canvas.broadcastDrawing(data), 90, 60);
        guard('clearCanvas', () => canvas.clearCanvas(), 3, 1);
        guard('message', (data) => game.onMessage(data), 8, 4);
        socket.on('disconnect', () => {
            try { new Disconnect(io, socket).onDisconnect(); } catch (error) { console.error('Room disconnect cleanup failed'); }
            buckets.clear();
        });
    });
    return io;
};
