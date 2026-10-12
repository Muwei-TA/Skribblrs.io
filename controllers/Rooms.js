/* global games */
const { nanoid } = require('nanoid');
const validate = require('./validation');
const { publicSettings, refreshIdle } = require('./lifecycle');

class Room {
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
    }

    async createPrivateRoom(input) {
        const { socket, io } = this;
        validate.ensure(!socket.roomID, 'INVALID_STATE', '请先退出当前房间');
        validate.ensure(Object.keys(games).length < 200, 'CAPACITY', '房间数量已达上限');
        const player = validate.player(input, socket.id);
        const id = nanoid(15);
        const room = {
            rounds: 2,
            time: 40000,
            customWords: [],
            language: 'Chinese',
            probability: 0.5,
            hostID: socket.id,
            state: 'lobby',
            players: Object.create(null),
        };
        games[id] = room;
        room.players[socket.id] = player;
        socket.player = player;
        socket.roomID = id;
        await socket.join(id);
        refreshIdle(io, id);
        socket.emit('newPrivateRoom', { gameID: id });
        return { gameID: id };
    }

    async joinRoom(input) {
        const { io, socket } = this;
        validate.record(input);
        validate.ensure(typeof input.id === 'string' && /^[\w-]{15}$/.test(input.id));
        const room = games[input.id];
        validate.ensure(room, 'ROOM_NOT_FOUND', '房间不存在或已关闭');
        validate.ensure(!socket.roomID, 'INVALID_STATE', '请先退出当前房间');
        validate.ensure(room.state === 'lobby', 'INVALID_STATE', '游戏已经开始，暂时无法加入');
        validate.ensure(Object.keys(room.players).length < 12, 'CAPACITY', '房间已满');
        const player = validate.player(input.player, socket.id);
        const others = Object.values(room.players);
        room.players[socket.id] = player;
        socket.player = player;
        socket.roomID = input.id;
        await socket.join(input.id);
        socket.emit('settingsUpdate', publicSettings(room));
        socket.to(input.id).emit('joinRoom', player);
        socket.emit('otherPlayers', others);
        refreshIdle(io, input.id);
    }

    updateSettings(input) {
        const { socket, io } = this;
        const room = validate.host(socket);
        validate.ensure(room.state === 'lobby', 'INVALID_STATE', '游戏开始后不能修改设置');
        const settings = validate.settings(input);
        Object.assign(room, settings);
        socket.to(socket.roomID).emit('settingsUpdate', publicSettings(room));
        refreshIdle(io, socket.roomID);
    }
}

module.exports = Room;
