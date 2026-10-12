const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const ejs = require('ejs');
const { get3Words, getHints } = require('../controllers/helpers');
const words = require('../words.json');

test('Chinese word bank contains hundreds of unique drawable words', () => {
    assert.ok(Array.isArray(words.chinese));
    assert.ok(words.chinese.length >= 300);
    assert.equal(new Set(words.chinese).size, words.chinese.length);
    assert.ok(words.chinese.every((word) => /^[\u4e00-\u9fff]{1,8}$/.test(word)));
});

test('host and guest pages default to Simplified Chinese and retain English', async () => {
    for (const roomID of [undefined, 'invited-room']) {
        const html = await ejs.renderFile('views/index.ejs', { roomID });
        assert.ok(/value="Chinese" selected>简体中文<\/option>/.test(html));
        assert.ok(/value="English">英语<\/option>/.test(html));
    }
});

test('Chinese rooms offer three distinct words and support custom Chinese words', () => {
    global.games = { chinese: { language: 'Chinese', customWords: [], probability: 0 } };
    const picked = get3Words('chinese');
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked).size, 3);
    assert.ok(picked.every((word) => words.chinese.includes(word)));
    games.chinese.customWords = ['苹果', '香蕉', '西瓜'];
    games.chinese.probability = 1;
    assert.deepEqual(new Set(get3Words('chinese')), new Set(games.chinese.customWords));
});

test('short Chinese words reveal no characters; longer words get limited late hints', () => {
    global.games = { chinese: { language: 'Chinese', time: 60000 } };
    for (const word of ['猫', '苹果']) assert.deepEqual(getHints(word, 'chinese'), []);
    for (const word of ['自行车', '公共汽车']) {
        const hints = getHints(word, 'chinese');
        assert.equal(hints.length, 1);
        assert.equal(hints[0].hint.replace(/_/g, '').length, 1);
        assert.ok(hints[0].displayTime <= 20);
    }
});

test('English picking and hints remain available', () => {
    global.games = { english: { language: 'English', time: 60000, customWords: [] } };
    assert.ok(get3Words('english').every((word) => words.english.includes(word)));
    assert.equal(getHints('apple', 'english').length, 3);
});

test('Chinese input never calls the unsupported transliteration API', async () => {
    let onInput;
    const input = { value: '苹果', addEventListener(event, callback) { onInput = callback; } };
    const suggestions = { innerHTML: '' };
    let requests = 0;
    const context = {
        language: 'Chinese',
        document: { querySelector: (selector) => (selector === '#suggestions' ? suggestions : input) },
        fetch: async () => { requests++; return { json: async () => ({ result: [] }) }; },
    };
    vm.runInNewContext(readFileSync('public/js/transliterate.js', 'utf8'), context);
    await onInput.call(input);
    assert.equal(requests, 0);
    context.language = 'English';
    await onInput.call(input);
    assert.equal(requests, 0);
});

function browser() {
    const nodes = new Map();
    const appended = [];
    const handlers = {};
    const emitted = [];
    function element() {
        const classes = new Set();
        return { value: 'Chinese', children: [], listeners: {}, classList: {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name),
        }, getBoundingClientRect: () => ({ left: 0, top: 0 }),
            append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); },
            addEventListener(event, callback) { this.listeners[event] = callback; }, setAttribute() {} };
    }
    function node(selector) {
        if (selector === '#transliterate') return appended.find((item) => item.id === 'transliterate') || null;
        if (!nodes.has(selector)) nodes.set(selector, element());
        return nodes.get(selector);
    }
    const socket = { on: (event, callback) => {
        const previous = handlers[event];
        handlers[event] = (...args) => { if (previous) previous(...args); return callback(...args); };
    }, emit: (...args) => emitted.push(args) };
    const context = vm.createContext({
        io: () => socket, socket, language: 'Chinese', my: {}, URLSearchParams,
        window: { location: { toString: () => 'http://game.test/' }, addEventListener() {} },
        document: { querySelector: node, querySelectorAll: () => [], createElement: element,
            getElementById: (id) => node(`#${id}`), getElementsByClassName: () => [],
            createTextNode: (text) => ({ textContent: text }), body: { append: (...items) => appended.push(...items) } },
        Howl: function Howl() { this.play = () => {}; this.stop = () => {}; },
        clearInterval() {}, animateCSS: async () => {},
        Sketchpad: function Sketchpad() {
            this.sketching = true;
            this.setReadOnly = (value) => { this.readOnly = value; };
            this.getCanvasSize = () => ({ width: 100, height: 100 });
        },
    });
    return { context, node, appended, handlers, emitted };
}

test('Chinese defaults and room updates do not load transliteration scripts', () => {
    const page = browser();
    vm.runInContext(readFileSync('public/js/settings.js', 'utf8'), page.context);
    assert.equal(vm.runInContext('language', page.context), 'Chinese');
    page.node('#language').listeners.input.call(page.node('#language'));
    assert.equal(page.appended.length, 0);
    vm.runInContext(readFileSync('public/js/game.js', 'utf8'), page.context);
    page.handlers.settingsUpdate({ language: 'Chinese', rounds: 2, time: 40 });
    assert.equal(page.appended.length, 0);
    page.handlers.settingsUpdate({ language: 'Hindi', rounds: 2, time: 40 });
    assert.equal(page.appended[0].src, 'js/transliterate.js');
});

test('confirming Chinese input composition does not prematurely send or clear a guess', () => {
    const page = browser();
    vm.runInContext(readFileSync('public/js/game.js', 'utf8'), page.context);
    const input = page.node('#sendMessage>input');
    const form = page.node('#sendMessage');
    form.firstElementChild = input;
    input.value = '苹果';
    input.listeners.compositionstart();
    form.listeners.submit.call(form, { preventDefault() {} });
    assert.equal(page.emitted.length, 0);
    assert.equal(input.value, '苹果');
    input.listeners.compositionend();
    form.listeners.submit.call(form, { preventDefault() {} });
    assert.equal(page.emitted[0][0], 'message');
    assert.equal(page.emitted[0][1].message, '苹果');
    assert.equal(input.value, '');
});

test('the host waits for server approval before switching to the game canvas', async () => {
    const page = browser();
    vm.runInContext(readFileSync('public/js/settings.js', 'utf8'), page.context);
    await page.node('#startGame').listeners.click();
    assert.equal(page.appended.length, 0);
    assert.deepEqual(page.emitted.map((args) => args[0]), ['startGame']);
});

test('pages use the Socket.IO client supplied by the installed server', async () => {
    const html = await ejs.renderFile('views/index.ejs', { roomID: undefined });
    assert.ok(html.includes('src="/socket.io/socket.io.js"'));
});

test('a previous turn fade-out cannot hide the new drawers tools', async () => {
    const page = browser();
    let finishFade;
    page.context.animateCSS = (selector, animation) => animation === 'fadeOutDown'
        ? new Promise((resolve) => { finishFade = resolve; }) : Promise.resolve();
    vm.runInContext(readFileSync('public/js/game.js', 'utf8'), page.context);
    vm.runInContext(readFileSync('public/js/canvas.js', 'utf8'), page.context);
    const hiding = page.handlers.disableCanvas();
    await page.handlers.chooseWord(['苹果', '自行车', '公共汽车']);
    page.handlers.wordChosen({ word: '苹果' });
    finishFade(); await hiding;
    assert.equal(page.node('#tools').classList.contains('d-none'), false);
    assert.equal(vm.runInContext('pad.readOnly', page.context), false);
});

test('sustained drawing stays below the servers rate budget', () => {
    const page = browser();
    let now = 0;
    page.context.Date = class Clock extends Date { constructor() { super(now); } };
    vm.runInContext(readFileSync('public/js/game.js', 'utf8'), page.context);
    vm.runInContext(readFileSync('public/js/canvas.js', 'utf8'), page.context);
    page.handlers.wordChosen({ word: '苹果' });
    const canvas = page.node('#sketchpad');
    canvas.listeners.mousedown({ clientX: 0, clientY: 0 });
    for (now = 5; now <= 10000; now += 5) canvas.listeners.mousemove({ clientX: 50, clientY: 50 });
    const count = page.emitted.filter((args) => args[0] === 'drawing').length;
    assert.ok(count >= 400 && count <= 600, `Drawing rate was ${count / 10} per second`);
});

async function connect(port, sockets) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    sockets.push(socket);
    const queue = [];
    const pending = [];
    socket.addEventListener('message', ({ data }) => {
        const packet = String(data);
        if (packet === '2') { socket.send('3'); return; }
        queue.push(packet);
        for (const waiter of [...pending]) {
            const index = queue.findIndex(waiter.match);
            if (index !== -1) {
                pending.splice(pending.indexOf(waiter), 1);
                clearTimeout(waiter.timer);
                waiter.resolve(queue.splice(index, 1)[0]);
            }
        }
    });
    function next(match) {
        const index = queue.findIndex(match);
        if (index !== -1) return Promise.resolve(queue.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
            const waiter = { match, resolve, timer: setTimeout(() => {
                pending.splice(pending.indexOf(waiter), 1);
                reject(new Error('Socket.IO event timed out'));
            }, 5000) };
            pending.push(waiter);
        });
    }
    await next((packet) => packet.startsWith('0'));
    socket.send('40');
    const { sid } = JSON.parse((await next((packet) => packet.startsWith('40'))).slice(2));
    return {
        id: sid,
        send: (event, data) => socket.send(`42${JSON.stringify([event, data])}`),
        event: async (event, matches = () => true) => JSON.parse((await next((packet) => packet.startsWith('42')
            && JSON.parse(packet.slice(2))[0] === event && matches(JSON.parse(packet.slice(2))[1]))).slice(2))[1],
        queued: (event) => queue.some((packet) => packet.startsWith('42') && JSON.parse(packet.slice(2))[0] === event),
    };
}

test('real WebSocket clients synchronize language, guess Chinese words and earn points', { timeout: 15000 }, async (t) => {
    const sockets = [];
    const server = spawn(process.execPath, ['bin/www'], { env: { ...process.env, PORT: '0', IP: '127.0.0.1' } });
    t.after(() => { sockets.forEach((socket) => socket.close()); server.kill(); });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
        server.stdout.on('data', (data) => {
            const match = String(data).match(/Server listening on port (\d+)/);
            if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
        server.once('error', reject);
    });
    const host = await connect(port, sockets);
    host.send('newPrivateRoom', { name: '房主', avatar: '/images/socket.io.png' });
    const { gameID } = await host.event('newPrivateRoom');
    const guest = await connect(port, sockets);
    guest.send('joinRoom', { id: gameID, player: { name: '玩家', avatar: '/images/socket.io.png' } });
    assert.equal((await guest.event('settingsUpdate')).language, 'Chinese');
    host.send('settingsUpdate', { language: 'English', rounds: 1, time: 30, probability: 0, customWords: [] });
    assert.equal((await guest.event('settingsUpdate')).language, 'English');
    const lateGuest = await connect(port, sockets);
    lateGuest.send('joinRoom', { id: gameID, player: { name: '后来玩家', avatar: '/images/socket.io.png' } });
    const settings = await lateGuest.event('settingsUpdate');
    assert.equal(settings.language, 'English');
    assert.equal(settings.time, 30);
    host.send('settingsUpdate', { language: 'Chinese', rounds: 1, time: 30, probability: 1, customWords: ['苹果', '自行车', '公共汽车'] });
    assert.equal((await guest.event('settingsUpdate')).language, 'Chinese');
    host.send('startGame');
    const offered = await host.event('chooseWord');
    assert.deepEqual(new Set(offered), new Set(['苹果', '自行车', '公共汽车']));
    host.send('chooseWord', { word: '苹果' });
    assert.equal((await guest.event('hideWord')).word, '__');
    assert.deepEqual(await guest.event('hints'), []);
    await guest.event('startTimer');
    guest.send('message', { message: '火车' });
    assert.equal((await guest.event('message')).message, '火车');
    guest.send('message', { message: '苹梨' });
    await guest.event('message');
    guest.send('message', { message: ' 苹果 ' });
    assert.equal((await guest.event('correctGuess')).id, guest.id);
    const score = await guest.event('updateScore');
    assert.equal(score.playerID, guest.id);
    assert.ok(score.score > 0);
    assert.equal(score.drawerScore, 250);
    assert.equal(guest.queued('closeGuess'), false);
    lateGuest.send('message', { message: '苹果' });
    await guest.event('chooseWord');
    guest.send('chooseWord', { word: '自行车' });
    assert.equal((await host.event('hideWord')).word, '___');
    const hints = await host.event('hints');
    assert.equal(hints.length, 1);
    assert.ok(hints[0].displayTime <= 10);
    host.send('message', { message: '自形车' });
    await host.event('closeGuess');
    host.send('message', { message: '自行车' });
    assert.equal((await host.event('correctGuess', (data) => data.id === host.id)).id, host.id);
});
