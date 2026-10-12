/* global games */
const words = require('../words.json');

class GameError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function ensure(condition, code = 'INVALID_INPUT', message = '输入内容无效') {
    if (!condition) throw new GameError(code, message);
}

function record(value) {
    ensure(value !== null && typeof value === 'object' && !Array.isArray(value));
    return value;
}

function text(value, limit, allowEmpty = false) {
    ensure(typeof value === 'string' && value.length <= limit);
    const clean = value.trim();
    // Reject control characters in all user-facing fields.
    // eslint-disable-next-line no-control-regex
    ensure((allowEmpty || clean.length > 0) && !/[\u0000-\u001f\u007f]/.test(clean));
    return clean;
}

function player(value, id) {
    record(value);
    const name = text(value.name, 32);
    const avatar = text(value.avatar || '/images/socket.io.png', 2048);
    ensure((avatar.startsWith('/') && !avatar.startsWith('//')) || /^https?:\/\//i.test(avatar));
    return {
        id, name, avatar, score: 0,
    };
}

function number(value, min, max, integer = false) {
    ensure(typeof value === 'number'
        || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)));
    const result = Number(value);
    ensure(Number.isFinite(result) && result >= min && result <= max
        && (!integer || Number.isInteger(result)));
    return result;
}

function settings(value) {
    record(value);
    const inputLanguage = text(value.language, 20);
    const language = inputLanguage[0].toUpperCase() + inputLanguage.slice(1).toLowerCase();
    ensure(Object.hasOwn(words, language.toLowerCase()), 'INVALID_INPUT', '不支持该词库语言');
    ensure(Array.isArray(value.customWords) && value.customWords.length <= 100);
    const customWords = [...new Set(value.customWords.map((word) => text(word, 40)))];
    return {
        rounds: number(value.rounds, 1, 10, true),
        time: number(value.time, 30, 180, true) * 1000,
        probability: number(value.probability, 0, 1),
        language,
        customWords,
    };
}

function room(socket) {
    const current = games[socket.roomID];
    ensure(current && current.players && Object.hasOwn(current.players, socket.id)
        && socket.rooms.has(socket.roomID), 'NOT_IN_ROOM', '请先加入有效房间');
    return current;
}

function host(socket) {
    const current = room(socket);
    ensure(current.hostID === socket.id, 'FORBIDDEN', '只有房主可以执行此操作');
    return current;
}

function drawer(socket, phase) {
    const current = room(socket);
    ensure(current.drawer === socket.id, 'FORBIDDEN', '只有当前绘图者可以执行此操作');
    ensure(current.state === 'playing' && current.phase === phase, 'INVALID_STATE', '当前回合不允许此操作');
    return current;
}

function drawing(value) {
    record(value);
    const point = (input) => {
        record(input);
        ensure(typeof input.x === 'number' && typeof input.y === 'number');
        return { x: number(input.x, 0, 1), y: number(input.y, 0, 1) };
    };
    ensure(typeof value.lineColor === 'string' && value.lineColor.length <= 32);
    const rgb = value.lineColor.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    ensure(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.lineColor)
        || (rgb && rgb.slice(1).every((channel) => Number(channel) <= 255)));
    return {
        start: point(value.start),
        end: point(value.end),
        lineColor: value.lineColor,
        lineSize: number(value.lineSize, 1, 30, true),
    };
}

module.exports = {
    GameError, ensure, record, text, player, settings, room, host, drawer, drawing,
};
