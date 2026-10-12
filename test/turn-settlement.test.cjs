const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const Game = require('../controllers/Game');
const { pause } = require('../controllers/helpers');
const { closeRoom } = require('../controllers/lifecycle');

function gameRoom() {
    const events = [];
    const emit = (event, data) => events.push({ event, data });
    const drawer = new EventEmitter();
    Object.assign(drawer, { id: 'drawer', roomID: 'room', rooms: new Set(['room']),
        player: { id: 'drawer', name: '画家', score: 0 }, to: () => ({ emit }) });
    const guest = { id: 'guest', roomID: 'room', hasGuessed: false,
        player: { id: 'guest', name: '玩家', score: 0 }, rooms: new Set(['room']) };
    const room = { hostID: 'drawer', state: 'playing', time: 5, language: 'Chinese', probability: 1,
        customWords: ['苹果', '香蕉', '西瓜'], players: { drawer: drawer.player, guest: guest.player } };
    const io = { to: () => ({ emit }), sockets: { sockets: new Map([['drawer', drawer], ['guest', guest]]),
        adapter: { rooms: new Map() } } };
    global.games = { room };
    global.round = new EventEmitter();
    return { game: new Game(io, drawer), room, drawer, io, events };
}

test('expired drawing reveals its answer, blocks scoring and keeps the canvas during settlement', async () => {
    const { game, room, events } = gameRoom();
    const pending = game.giveTurnTo('room', ['drawer', 'guest'], 0);
    game.chooseWord({ word: '苹果' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const end = events.find(({ event }) => event === 'turnEnded');
    assert.ok(end);
    assert.equal(end.data.reason, 'timeout');
    assert.equal(end.data.word, '苹果');
    assert.ok(end.data.scores.every((p) => p.gained === 0));
    assert.equal(room.phase, 'settling');
    assert.equal(room.currentWord, '');
    assert.ok(events.some(({ event }) => event === 'disableCanvas'));
    assert.equal(events.filter(({ event }) => event === 'clearCanvas').length, 1);
    room.cancelTurn();
    await pending;
    assert.equal(room.cancelTurn, undefined);
    assert.equal(global.round.eventNames().length, 0);
});

test('closing a room cancels its settlement delay and never permits another turn', async () => {
    const { room, io } = gameRoom();
    room.phase = 'settling';
    const pending = pause('room', 3000);
    closeRoom(io, 'room');
    await pending;
    assert.equal(global.games.room, undefined);
    assert.equal(room.cancelTurn, undefined);
    assert.equal(room.state, 'finished');
});
