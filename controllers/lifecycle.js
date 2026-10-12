/* global games */
function closeRoom(io, roomID, message = '房间已关闭') {
    const room = games[roomID];
    if (!room) return;
    const wasPlaying = room.state === 'playing';
    room.state = 'finished';
    clearTimeout(room.idleTimer);
    if (room.cancelTurn) room.cancelTurn();
    if (wasPlaying) io.to(roomID).emit('endGame', { stats: room.players, replayable: false, message });
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
    if (!room || !['lobby', 'finished'].includes(room.state)) return;
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => closeRoom(io, roomID, '房间长时间未使用，已关闭'), 15 * 60 * 1000);
    room.idleTimer.unref();
}

function finishGame(io, roomID) {
    const room = games[roomID];
    if (!room) return;
    room.state = 'finished';
    room.phase = 'finished';
    room.currentWord = '';
    delete room.drawer;
    io.to(roomID).emit('endGame', { stats: room.players, replayable: true, hostID: room.hostID });
    refreshIdle(io, roomID);
}

function resetScores(io, room) {
    Object.values(room.players).forEach((player) => {
        // Player objects belong to this room; reset them for a new game.
        Object.assign(player, { score: 0 });
        const socket = io.sockets.sockets.get(player.id);
        if (socket) socket.hasGuessed = false;
    });
}

function publicSettings(room) {
    return {
        rounds: room.rounds,
        time: room.time / 1000,
        language: room.language,
        probability: room.probability,
    };
}

module.exports = { closeRoom, finishGame, resetScores, refreshIdle, publicSettings };
