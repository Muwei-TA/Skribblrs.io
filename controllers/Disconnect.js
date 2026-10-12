/* global games, round */
const { closeRoom } = require('./lifecycle');

class Disconnect {
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
    }

    onDisconnect() {
        const { io, socket } = this;
        const { roomID } = socket;
        const room = games[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        delete room.players[socket.id];
        if (player) io.to(roomID).emit('disconnection', player);
        if (room.hostID === socket.id || Object.keys(room.players).length === 0) {
            closeRoom(io, roomID, '房主已离开，房间已关闭');
        } else if (room.state === 'playing') {
            if (Object.keys(room.players).length < 2) {
                closeRoom(io, roomID, '玩家不足，游戏已结束');
            } else {
                const remaining = Object.values(room.players).filter((p) => p.id !== room.drawer);
                const unguessed = remaining.filter((p) => !io.sockets.sockets
                    .get(p.id)?.hasGuessed);
                if (unguessed.length === 0) round.emit(`everybodyGuessed:${roomID}`);
            }
        }
        delete socket.roomID;
        delete socket.player;
    }
}

module.exports = Disconnect;
