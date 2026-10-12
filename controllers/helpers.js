/* global MAX_POINTS, round, games */
const Chance = require('chance');
const GraphemeSplitter = require('grapheme-splitter');

const chance = new Chance();
const splitter = new GraphemeSplitter();
const words = require('../words.json');
const { ensure } = require('./validation');

function getScore(startTime, roundtime) {
    const now = Date.now() / 1000;
    const elapsedTime = now - startTime;
    const roundTime = roundtime / 1000;
    const score = Math.floor(((roundTime - elapsedTime) / roundTime) * MAX_POINTS);
    return Math.max(0, Math.min(MAX_POINTS, score));
}

function populateDisplayTime(hints, roomID) {
    const roundTime = games[roomID].time;
    const startTime = Math.floor(roundTime / 3);
    const hintInterval = Math.floor(startTime / hints.length);
    return hints.map((hint, i) => ({
        hint,
        displayTime: Math.floor((startTime - (i * hintInterval)) / 1000),
    }));
}

function getHints(word, roomID) {
    let hints = [];
    const graphemes = splitter.splitGraphemes(word);
    const positions = graphemes.map((char, index) => (char !== ' ' ? index : -1))
        .filter((index) => index !== -1);
    const hintsCount = Math.floor(positions.length / 3);
    let prevHint = graphemes.map((char) => (char !== ' ' ? '_' : ' '));
    chance.pickset(positions, hintsCount).forEach((pos) => {
        prevHint = [...prevHint.slice(0, pos), graphemes[pos], ...prevHint.slice(pos + 1)];
        hints.push(prevHint);
    });
    hints = hints.map((hint) => hint.join(''));
    return populateDisplayTime(hints, roomID);
}

function wait(roomID, drawer, ms) {
    const room = games[roomID];
    const event = `everybodyGuessed:${roomID}`;
    return new Promise((resolve) => {
        let timer;
        let onGuessed;
        let onDisconnect;
        let cancel;
        const finish = (expired) => {
            clearTimeout(timer);
            round.removeListener(event, onGuessed);
            drawer.removeListener('disconnect', onDisconnect);
            if (room && room.cancelTurn === cancel) delete room.cancelTurn;
            resolve(expired);
        };
        cancel = () => finish(false);
        onGuessed = () => finish(false);
        onDisconnect = () => finish(false);
        round.once(event, onGuessed);
        drawer.once('disconnect', onDisconnect);
        if (room) room.cancelTurn = cancel;
        timer = setTimeout(() => finish(true), ms);
    });
}

function get3Words(roomID) {
    const room = games[roomID];
    ensure(room && typeof room.language === 'string');
    const language = room.language.toLowerCase();
    ensure(Object.hasOwn(words, language));
    let base = [...new Set(words[language])].filter((word) => word.length <= 64);
    let custom = [...new Set((Array.isArray(room.customWords) ? room.customWords : [])
        .filter((word) => typeof word === 'string' && word.trim() && word.length <= 40)
        .map((word) => word.trim()))];
    if (custom.length < 3) return chance.pickset(base, 3);
    const probability = Number.isFinite(room.probability) ? room.probability : 0.5;
    const picked = [];
    for (let i = 0; i < 3; i++) {
        const useCustom = custom.length > 0
            && (base.length === 0
                || chance.bool({ likelihood: Math.max(0, Math.min(1, probability)) * 100 }));
        const word = chance.pickone(useCustom ? custom : base);
        picked.push(word);
        base = base.filter((candidate) => candidate !== word);
        custom = custom.filter((candidate) => candidate !== word);
    }
    return picked;
}

function getPlayersCount(roomID) {
    return Object.keys(games[roomID]?.players || {}).length;
}

module.exports = {
    getScore,
    getHints,
    wait,
    get3Words,
    getPlayersCount,
};
