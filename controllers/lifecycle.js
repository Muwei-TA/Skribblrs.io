/* global games */
function closeRoom(io, roomID, message = '房间已关闭') {
    const room = games[roomID];
    if (!room) return;
    const wasPlaying = room.state === 'playing';
    room.state = 'finished';
    clearTimeout(room.idleTimer);
    if (room.cancelTurn) room.cancelTurn();
    if (wasPlaying) io.to(roomID).emit('endGame', { stats: room.players });
    else io.to(roomID).emit('roomClosed', { message });
    const members = [...(io.sockets.adapter.rooms.get(roomID) || [])];
    delete games[roomID];
    members.forEach((id) => {
        const socket = io.sockets.sockets.get(id);
        if (socket && socket.roomID === roomID) {
            socket.leave(roomID);
            delete socket.roomID;
            delete socket.player;
        }
    });
}

function refreshIdle(io, roomID) {
    const room = games[roomID];
    if (!room || room.state !== 'lobby') return;
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => closeRoom(io, roomID, '房间长时间未使用，已关闭'), 15 * 60 * 1000);
    room.idleTimer.unref();
}

function publicSettings(room) {
    return {
        rounds: room.rounds,
        time: room.time / 1000,
        language: room.language,
        probability: room.probability,
    };
}

module.exports = { closeRoom, refreshIdle, publicSettings };
