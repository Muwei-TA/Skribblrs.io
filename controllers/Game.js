/* global games, BONUS, round */
const leven = require('leven');
const GraphemeSplitter = require('grapheme-splitter');
const {
    get3Words, getScore, wait, getHints, pause,
} = require('./helpers');
const validate = require('./validation');
const { finishGame, resetScores, refreshIdle, publicSettings } = require('./lifecycle');
const { matchesAnswer } = require('./answers');

const splitter = new GraphemeSplitter();
class Game {
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
    }

    chosenWord(drawerID, choices) {
        const drawer = this.io.sockets.sockets.get(drawerID);
        const room = games[drawer.roomID];
        return new Promise((resolve) => {
            let timer;
            let cancel;
            let onDisconnect;
            const finish = (word) => {
                room.phase = 'selected';
                clearTimeout(timer);
                drawer.removeListener('disconnect', onDisconnect);
                if (room.cancelTurn === cancel) delete room.cancelTurn;
                delete room.resolveChoice;
                delete room.offeredWords;
                resolve(word);
            };
            cancel = () => finish(null);
            onDisconnect = () => finish(null);
            room.offeredWords = choices;
            room.resolveChoice = finish;
            room.cancelTurn = cancel;
            drawer.once('disconnect', onDisconnect);
            timer = setTimeout(() => finish(choices[1]), 15000);
        });
    }

    chooseWord(input) {
        const room = validate.drawer(this.socket, 'choosing');
        validate.record(input);
        validate.ensure(typeof input.word === 'string' && room.offeredWords.includes(input.word));
        room.resolveChoice(input.word);
    }

    async startGame() {
        const { io, socket } = this;
        const room = validate.host(socket);
        validate.ensure(room.state === 'lobby', 'INVALID_STATE', '游戏已经开始');
        const players = Object.keys(room.players);
        validate.ensure(players.length >= 2, 'INVALID_STATE', '至少需要两名玩家才能开始');
        const { roomID } = socket;
        resetScores(io, room);
        room.state = 'playing';
        clearTimeout(room.idleTimer);
        io.to(roomID).emit('startGame');
        io.to(roomID).emit('getPlayers', Object.values(room.players));
        try {
            for (let j = 0; j < room.rounds; j++) {
                for (let i = 0; i < players.length; i++) {
                    if (games[roomID] !== room || room.state !== 'playing') return;
                    // eslint-disable-next-line no-await-in-loop
                    await this.giveTurnTo(roomID, players, i);
                }
            }
        } finally {
            if (games[roomID] === room) finishGame(io, roomID);
        }
    }

    returnToLobby() {
        const { socket, io } = this;
        const room = validate.host(socket);
        validate.ensure(room.state === 'finished', 'INVALID_STATE', '请等待本局游戏结束');
        room.state = 'lobby';
        room.phase = 'lobby';
        resetScores(io, room);
        refreshIdle(io, socket.roomID);
        io.to(socket.roomID).emit('lobbyReady', {
            players: Object.values(room.players),
            settings: publicSettings(room),
        });
    }

    async giveTurnTo(roomID, players, index) {
        const room = games[roomID];
        const { io } = this;
        const drawer = io.sockets.sockets.get(players[index]);
        if (!drawer || !room.players[drawer.id]) return;
        Object.keys(room.players).forEach((id) => {
            const player = io.sockets.sockets.get(id);
            if (player) player.hasGuessed = false;
        });
        const before = new Map(Object.values(room.players).map((player) => [player.id, player.score]));
        room.currentWord = '';
        const previousDrawer = room.drawer;
        room.drawer = drawer.id;
        room.phase = 'choosing';
        if (previousDrawer && previousDrawer !== drawer.id) {
            io.to(previousDrawer).emit('disableCanvas');
        }
        drawer.to(roomID).emit('choosing', { name: drawer.player.name });
        const choices = get3Words(roomID);
        const selection = this.chosenWord(drawer.id, choices);
        drawer.emit('chooseWord', choices);
        const word = await selection;
        if (!word || games[roomID] !== room || room.state !== 'playing') return;
        room.currentWord = word;
        room.phase = 'drawing';
        room.startTime = Date.now() / 1000;
        drawer.emit('wordChosen', { word });
        drawer.to(roomID).emit('hideWord', { word: splitter.splitGraphemes(word).map((char) => (char !== ' ' ? '_' : char)).join('') });
        io.to(roomID).emit('clearCanvas');
        drawer.to(roomID).emit('hints', getHints(word, roomID));
        const waiting = wait(roomID, drawer, room.time);
        io.to(roomID).emit('startTimer', { time: room.time });
        const expired = await waiting;
        if (games[roomID] !== room || room.state !== 'playing') return;
        room.phase = 'settling';
        room.currentWord = '';
        io.to(roomID).emit('disableCanvas');
        io.to(roomID).emit('turnEnded', {
            word,
            reason: !room.players[drawer.id] ? 'drawerLeft' : (expired ? 'timeout' : 'allGuessed'),
            delay: 3000,
            scores: Object.values(room.players).map((player) => ({
                id: player.id, name: player.name, score: player.score,
                gained: player.score - (before.get(player.id) || 0),
            })),
        });
        await pause(roomID, 3000);
    }

    onMessage(input) {
        const { io, socket } = this;
        const room = validate.room(socket);
        validate.record(input);
        const message = validate.text(input.message, 500);
        refreshIdle(io, socket.roomID);
        const data = { message, name: socket.player.name };
        const currentWord = (room.currentWord || '').toLowerCase();
        const guess = message.toLowerCase();
        const distance = leven(guess, currentWord);
        const closeGuess = splitter.countGraphemes(currentWord) >= 3 && distance === 1;
        if (currentWord && room.phase === 'drawing' && matchesAnswer(currentWord, message)) {
            socket.emit('message', data);
            if (room.drawer !== socket.id && !socket.hasGuessed) {
                socket.hasGuessed = true;
                room.players[socket.id].score += getScore(room.startTime, room.time);
                room.players[room.drawer].score += BONUS;
                socket.emit('correctGuess', { message: 'You guessed it right!', id: socket.id });
                socket.to(socket.roomID).emit('correctGuess', { message: `${socket.player.name} has guessed the word!`, id: socket.id });
                io.to(socket.roomID).emit('updateScore', {
                    playerID: socket.id,
                    score: room.players[socket.id].score,
                    drawerID: room.drawer,
                    drawerScore: room.players[room.drawer].score,
                });
                const guessers = Object.keys(room.players).filter((id) => id !== room.drawer);
                if (guessers.every((id) => io.sockets.sockets.get(id)?.hasGuessed)) {
                    round.emit(`everybodyGuessed:${socket.roomID}`);
                }
            }
        } else {
            io.to(socket.roomID).emit('message', data);
            if (currentWord && closeGuess && room.phase === 'drawing'
                && room.drawer !== socket.id && !socket.hasGuessed) {
                socket.emit('closeGuess', { message: 'That was very close!' });
            }
        }
    }

    getPlayers() {
        const room = validate.room(this.socket);
        this.socket.emit('getPlayers', Object.values(room.players));
    }
}

module.exports = Game;
