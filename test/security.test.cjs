const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { wait } = require('../controllers/helpers');

async function service(t) {
    const connections = [];
    const child = spawn(process.execPath, ['bin/www'], { env: { ...process.env, PORT: '0', IP: '127.0.0.1' } });
    t.after(() => { connections.forEach((ws) => ws.close()); child.kill(); });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Server startup timed out')), 5000);
        child.stdout.on('data', (data) => { const match = String(data).match(/port (\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
        child.once('error', reject);
    });
    async function connect() {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
        connections.push(ws);
        const packets = [], pending = [];
        let sequence = 0;
        ws.addEventListener('message', ({ data }) => {
            const packet = String(data);
            if (packet === '2') { ws.send('3'); return; }
            packets.push(packet);
            for (const waiter of [...pending]) {
                const index = packets.findIndex(waiter.match);
                if (index >= 0) { pending.splice(pending.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(packets.splice(index, 1)[0]); }
            }
        });
        function next(match, timeout = 2000) {
            const index = packets.findIndex(match);
            if (index >= 0) return Promise.resolve(packets.splice(index, 1)[0]);
            return new Promise((resolve, reject) => {
                const waiter = { match, resolve, timer: setTimeout(() => { pending.splice(pending.indexOf(waiter), 1); reject(Error('Event timed out')); }, timeout) };
                pending.push(waiter);
            });
        }
        await next((p) => p.startsWith('0')); ws.send('40');
        const { sid } = JSON.parse((await next((p) => p.startsWith('40'))).slice(2));
        return {
            id: sid, close: () => ws.close(),
            closed: () => new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Transport did not close')), 2000);
                ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
            }),
            send: (event, data) => ws.send(`42${JSON.stringify([event, data])}`),
            request: async (event, data) => {
                const id = ++sequence; ws.send(`42${id}${JSON.stringify([event, data])}`);
                return JSON.parse((await next((p) => p.startsWith(`43${id}[`))).slice(String(id).length + 2))[0];
            },
            event: async (event, timeout) => JSON.parse((await next((p) => p.startsWith('42') && JSON.parse(p.slice(2))[0] === event, timeout)).slice(2))[1],
            queued: (event) => packets.some((p) => p.startsWith('42') && JSON.parse(p.slice(2))[0] === event),
        };
    }
    return { connect, port, child };
}
const player = (name) => ({ name, avatar: '/images/socket.io.png' });
const settings = { rounds: 1, time: 30, language: 'Chinese', probability: 1, customWords: ['苹果', '自行车', '公共汽车'] };
const drawing = { start: { x: 0, y: 0 }, end: { x: 0.5, y: 0.5 }, lineColor: '#ff0000', lineSize: 5 };
async function room(server) {
    const host = await server.connect();
    assert.equal((await host.request('newPrivateRoom', player('房主'))).ok, true);
    const { gameID } = await host.event('newPrivateRoom');
    const guest = await server.connect();
    assert.equal((await guest.request('joinRoom', { id: gameID, player: player('玩家') })).ok, true);
    await guest.event('settingsUpdate');
    return { host, guest, gameID };
}

test('duplicate custom words cannot trap the selection loop', () => {
    const result = spawnSync(process.execPath, ['-e', "global.games={test:{language:'Chinese',probability:1,customWords:['苹果','苹果','苹果']}};const words=require('./controllers/helpers').get3Words('test');if(new Set(words).size!==3)process.exit(1)"], { timeout: 1000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
});

test('round waits remove all listeners on timeout, guesses and cancellation', async () => {
    for (const reason of ['timeout', 'guessed', 'disconnect']) {
        global.round = new EventEmitter(); global.games = { room: {} };
        const drawer = new EventEmitter();
        const pending = wait('room', drawer, reason === 'timeout' ? 1 : 1000);
        if (reason === 'guessed') round.emit('everybodyGuessed:room');
        if (reason === 'disconnect') drawer.emit('disconnect');
        await pending;
        assert.equal(round.eventNames().length, 0);
        assert.equal(drawer.listenerCount('disconnect'), 0);
    }
});

test('missing rooms and malformed events return errors without killing the service', { timeout: 10000 }, async (t) => {
    const server = await service(t), client = await server.connect();
    assert.equal((await client.request('joinRoom', { id: 'abcdefghijklmno', player: player('玩家') })).code, 'ROOM_NOT_FOUND');
    assert.equal((await client.request('newPrivateRoom', null)).code, 'INVALID_INPUT');
    assert.equal((await client.request('message', { message: 123 })).ok, false);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 200);
    assert.equal(server.child.exitCode, null);
});

test('only hosts can configure/start games and only the current drawer can choose/draw', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest, gameID } = await room(server);
    assert.equal((await guest.request('settingsUpdate', settings)).code, 'FORBIDDEN');
    assert.equal((await guest.request('startGame')).code, 'FORBIDDEN');
    assert.equal((await host.request('settingsUpdate', { ...settings, language: '__proto__' })).code, 'INVALID_INPUT');
    assert.equal((await host.request('settingsUpdate', { ...settings, language: 'English' })).code, 'INVALID_INPUT');
    assert.equal((await host.request('settingsUpdate', { ...settings, language: 'Hindi' })).code, 'INVALID_INPUT');
    assert.equal((await host.request('settingsUpdate', { ...settings, time: Infinity })).code, 'INVALID_INPUT');
    assert.equal((await host.request('settingsUpdate', settings)).ok, true);
    host.send('startGame'); await host.event('chooseWord');
    assert.equal((await host.request('startGame')).code, 'INVALID_STATE');
    assert.equal((await host.request('settingsUpdate', settings)).code, 'INVALID_STATE');
    const late = await server.connect();
    assert.equal((await late.request('joinRoom', { id: gameID, player: player('迟到') })).code, 'INVALID_STATE');
    assert.equal((await guest.request('chooseWord', { word: '苹果' })).code, 'FORBIDDEN');
    assert.equal((await host.request('chooseWord', { word: '不在候选词中' })).code, 'INVALID_INPUT');
    assert.equal((await host.request('chooseWord', { word: '苹果' })).ok, true);
    await guest.event('startTimer');
    assert.equal((await guest.request('drawing', drawing)).code, 'FORBIDDEN');
    assert.equal((await guest.request('clearCanvas')).code, 'FORBIDDEN');
    assert.equal((await host.request('drawing', { ...drawing, end: { x: 9999, y: 0 } })).code, 'INVALID_INPUT');
    assert.equal((await host.request('drawing', drawing)).ok, true);
    assert.deepEqual(await guest.event('drawing'), drawing);
});

test('guesses stay in their room and outsiders cannot read players or chat', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest } = await room(server), outsider = await server.connect();
    assert.equal((await outsider.request('getPlayers')).code, 'NOT_IN_ROOM');
    assert.equal((await outsider.request('message', { message: '苹果' })).code, 'NOT_IN_ROOM');
    await host.request('settingsUpdate', settings); host.send('startGame'); await host.event('chooseWord');
    await host.request('chooseWord', { word: '苹果' }); await guest.event('startTimer');
    assert.equal((await guest.request('message', { message: '苹果', name: '伪造名字' })).ok, true);
    const score = await guest.event('updateScore'); assert.ok(score.score > 0);
    await outsider.request('newPrivateRoom', player('其他房间'));
    assert.equal(outsider.queued('correctGuess'), false);
    assert.equal(outsider.queued('message'), false);
    assert.equal(outsider.queued('updateScore'), false);
});

test('chat payload and frequency limits reject flooding without affecting other clients', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest } = await room(server);
    assert.equal((await guest.request('message', { message: '字'.repeat(501) })).code, 'INVALID_INPUT');
    const replies = await Promise.all(Array.from({ length: 12 }, () => guest.request('message', { message: '正常聊天' })));
    assert.ok(replies.some((reply) => reply.code === 'RATE_LIMITED'));
    assert.equal((await host.request('getPlayers')).ok, true);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 200);
});

test('host departure closes the room and remaining clients can create a fresh room', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest, gameID } = await room(server);
    host.close(); await guest.event('roomClosed');
    assert.equal((await guest.request('joinRoom', { id: gameID, player: player('玩家') })).code, 'ROOM_NOT_FOUND');
    assert.equal((await guest.request('newPrivateRoom', player('新房主'))).ok, true);
});

test('oversized transport packets disconnect their sender while the service remains available', { timeout: 10000 }, async (t) => {
    const server = await service(t), client = await server.connect();
    const closed = client.closed();
    client.send('message', { message: 'x'.repeat(17000) });
    await closed;
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 200);
    assert.equal(server.child.exitCode, null);
});

test('drawing floods are limited without blocking chat from another player', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest } = await room(server);
    await host.request('settingsUpdate', settings); host.send('startGame'); await host.event('chooseWord');
    await host.request('chooseWord', { word: '苹果' }); await guest.event('startTimer');
    const replies = await Promise.all(Array.from({ length: 110 }, () => host.request('drawing', drawing)));
    assert.ok(replies.some((reply) => reply.code === 'RATE_LIMITED'));
    assert.equal((await guest.request('message', { message: '正常聊天' })).ok, true);
});

test('finishing a full game releases the room and all players can create new rooms', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest, gameID } = await room(server);
    await host.request('settingsUpdate', settings); host.send('startGame'); await host.event('chooseWord');
    await host.request('chooseWord', { word: '苹果' }); await guest.event('startTimer');
    await guest.request('message', { message: '苹果' }); await guest.event('chooseWord');
    await guest.request('chooseWord', { word: '自行车' }); await host.event('hideWord');
    await host.request('message', { message: '自行车' });
    const result = await host.event('endGame');
    assert.ok(result.stats[host.id].score > 0); assert.ok(result.stats[guest.id].score > 0);
    assert.equal((await host.request('getPlayers')).code, 'NOT_IN_ROOM');
    assert.equal((await guest.request('joinRoom', { id: gameID, player: player('玩家') })).code, 'ROOM_NOT_FOUND');
    assert.equal((await host.request('newPrivateRoom', player('新房主'))).ok, true);
    assert.equal((await guest.request('newPrivateRoom', player('另一房主'))).ok, true);
});

test('a disconnected drawer is skipped without stalling the next turn', { timeout: 15000 }, async (t) => {
    const server = await service(t), { host, guest, gameID } = await room(server), third = await server.connect();
    await third.request('joinRoom', { id: gameID, player: player('第三人') });
    await host.request('settingsUpdate', settings); host.send('startGame'); await host.event('chooseWord');
    await host.request('chooseWord', { word: '苹果' }); await guest.event('startTimer');
    await guest.request('message', { message: '苹果' }); await third.request('message', { message: '苹果' });
    await guest.event('chooseWord'); guest.close();
    const choices = await third.event('chooseWord'); assert.equal(choices.length, 3);
    assert.equal((await third.request('chooseWord', { word: choices[0] })).ok, true);
    assert.equal((await host.event('hideWord')).word.length, choices[0].length);
});

test('the server automatically chooses an offered word when the drawer does not respond', { timeout: 25000 }, async (t) => {
    const server = await service(t), { host, guest } = await room(server);
    await host.request('settingsUpdate', settings); host.send('startGame');
    const offered = await host.event('chooseWord');
    assert.equal((await host.event('wordChosen', 18000)).word, offered[1]);
    await guest.event('startTimer');
    assert.equal((await guest.request('message', { message: offered[1] })).ok, true);
    assert.ok((await guest.event('updateScore')).score > 0);
});

test('the bundled Socket.IO 4 client supports the acknowledgments used by the browser', { timeout: 10000 }, async (t) => {
    const server = await service(t);
    const bundle = require('../node_modules/socket.io/client-dist/socket.io.js');
    const client = bundle.io(`http://127.0.0.1:${server.port}`, { transports: ['websocket'] });
    t.after(() => client.disconnect());
    await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
    });
    const response = await client.timeout(2000).emitWithAck('newPrivateRoom', player('浏览器客户端'));
    assert.equal(response.ok, true);
    assert.equal(response.data.gameID.length, 15);
    const script = await fetch(`http://127.0.0.1:${server.port}/socket.io/socket.io.js`);
    assert.equal(script.status, 200);
});
