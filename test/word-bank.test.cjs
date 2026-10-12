const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync } = require('node:fs');
const validate = require('../controllers/validation');

function bank() {
    assert.ok(existsSync('public/js/word-bank.js'), 'shared word-bank parser must exist');
    return require('../public/js/word-bank');
}

const settings = { language: 'Chinese', rounds: 2, time: 40, probability: 1 };

test('TXT import removes BOM, blank lines, whitespace and duplicate words', () => {
    assert.deepEqual(bank().parseText('\ufeff 苹果 \r\n\r\n香蕉\r\n苹果\r\n西瓜\n'), ['苹果', '香蕉', '西瓜']);
});

test('TXT import rejects empty or insufficient word banks', () => {
    for (const text of ['', '苹果\n苹果\n香蕉']) {
        assert.throws(() => bank().parseText(text), /至少.*3/);
    }
});

test('TXT import enforces word count, length, control character and UTF-8 byte limits', () => {
    const parser = bank();
    assert.throws(() => parser.parseText(Array.from({ length: 101 }, (_, i) => `词语${i}`).join('\n')), /100/);
    assert.throws(() => parser.parseText(`苹果\n香蕉\n${'字'.repeat(41)}`), /40/);
    assert.throws(() => parser.parseText('苹果\n香蕉\n西\u0000瓜'), /控制字符/);
    assert.throws(() => parser.parseText('苹果\n香蕉\n西瓜\n' + ' '.repeat(16384)), /16 KB/);
    assert.throws(() => parser.parseText('字'.repeat(6000)), /16 KB/);
    const words = Array.from({ length: 100 }, (_, i) => `词语${i}`);
    assert.deepEqual(parser.parseText(words.join('\n')), words);
});

test('server rejects custom-only games with fewer than three distinct words', () => {
    for (const customWords of [[], ['苹果'], ['苹果', '苹果', '香蕉']]) {
        assert.throws(() => validate.settings({ ...settings, customWords }), /至少.*3/);
    }
    assert.deepEqual(validate.settings({ ...settings, customWords: ['苹果', '香蕉', '西瓜', '苹果'] }).customWords,
        ['苹果', '香蕉', '西瓜']);
    assert.deepEqual(validate.settings({ ...settings, probability: 0.5, customWords: [] }).customWords, []);
});

const vm = require('node:vm');
const { readFileSync } = require('node:fs');
function hostPage() {
    const nodes = new Map();
    const requests = [];
    function node(id) {
        if (!nodes.has(id)) nodes.set(id, {
            value: '', files: [], listeners: {}, classList: { add() {}, remove() {} },
            addEventListener(event, handler) { this.listeners[event] = handler; },
            setAttribute() {}, append() {},
        });
        return nodes.get(id);
    }
    for (const [id, value] of [['#rounds', '2'], ['#time', '40'], ['#language', 'Chinese'], ['#probability', '0.5']]) node(id).value = value;
    const socket = { on() {}, emit(event, data) { requests.push({ event, data }); }, timeout() { return { emit(event, data, callback) { requests.push({ event, data, callback }); } }; } };
    const context = vm.createContext({
        TextEncoder, TextDecoder, URLSearchParams, my: {}, io: () => socket,
        window: { location: { toString: () => 'http://game.test/' } },
        document: { querySelector: node, createElement: () => node('#notice'), body: { prepend() {} } },
        Howl: function Howl() { this.play = () => {}; },
    });
    vm.runInContext(readFileSync('public/js/word-bank.js', 'utf8'), context);
    vm.runInContext(readFileSync('public/js/settings.js', 'utf8'), context);
    const upload = async (text, name = '词库.txt', bytes) => {
        const buffer = new TextEncoder().encode(text);
        node('#wordBankFile').files = [{ name, size: bytes ?? buffer.length, arrayBuffer: async () => buffer.buffer }];
        return node('#wordBankFile').listeners.change();
    };
    return { node, requests, upload };
}

test('upload replaces editable words, selects custom-only mode and waits for server confirmation', async () => {
    const page = hostPage();
    assert.equal(typeof page.node('#wordBankFile').listeners.change, 'function');
    const pending = page.upload(' 苹果\r\n香蕉\r\n西瓜\r\n苹果');
    await new Promise(setImmediate);
    assert.equal(page.requests.length, 1);
    assert.equal(page.requests[0].event, 'settingsUpdate');
    assert.equal(page.requests[0].data.probability, '1');
    assert.deepEqual(Array.from(page.requests[0].data.customWords), ['苹果', '香蕉', '西瓜']);
    assert.equal(page.node('#customWords').value, '苹果\n香蕉\n西瓜');
    assert.equal(page.node('#wordBankStatus').textContent.includes('已导入'), false);
    page.requests[0].callback(null, { ok: true });
    await pending;
    assert.match(page.node('#wordBankStatus').textContent, /已导入 3/);
});

test('invalid uploads retain the previous word bank without sending settings', async () => {
    const page = hostPage();
    assert.equal(typeof page.node('#wordBankFile').listeners.change, 'function');
    page.node('#customWords').value = '旧词语';
    for (const [text, name, bytes] of [['苹果', '词库.txt'], ['苹果\n香蕉\n西瓜', '词库.csv'], ['', '词库.txt', 16385]]) {
        await page.upload(text, name, bytes);
        assert.equal(page.node('#customWords').value, '旧词语');
        assert.equal(page.requests.length, 0);
        assert.ok(page.node('#wordBankStatus').textContent);
    }
    page.node('#wordBankFile').files = [{ name: '乱码.txt', size: 1, arrayBuffer: async () => Uint8Array.of(0xff).buffer }];
    await page.node('#wordBankFile').listeners.change();
    assert.match(page.node('#wordBankStatus').textContent, /UTF-8/);
    assert.equal(page.requests.length, 0);
});

test('start saves the latest edited words before allowing the server to start', async () => {
    const page = hostPage();
    page.node('#customWords').value = '苹果\n香蕉\n西瓜';
    page.node('#probability').value = '1';
    const pending = page.node('#startGame').listeners.click();
    assert.equal(page.requests[0]?.event, 'settingsUpdate');
    assert.deepEqual(Array.from(page.requests[0].data.customWords), ['苹果', '香蕉', '西瓜']);
    assert.equal(page.requests.length, 1);
    page.requests[0].callback(null, { ok: true });
    await new Promise(setImmediate);
    assert.equal(page.requests[1].event, 'startGame');
    assert.equal(page.requests[1].callback, undefined, 'start must not wait for the entire game to acknowledge');
    await pending;
});

test('rejected settings saves prevent game start and never report a successful import', async () => {
    const page = hostPage();
    const importing = page.upload('苹果\n香蕉\n西瓜');
    await new Promise(setImmediate);
    page.requests[0].callback(null, { ok: false });
    await importing;
    assert.match(page.node('#wordBankStatus').textContent, /未保存/);
    const starting = page.node('#startGame').listeners.click();
    page.requests[1].callback(null, { ok: false });
    await starting;
    assert.equal(page.requests.some((request) => request.event === 'startGame'), false);
});

test('invalid edited words prevent game start without sending a settings update', async () => {
    const page = hostPage();
    page.node('#customWords').value = '苹果\n苹果\n香蕉';
    page.node('#probability').value = '1';
    await page.node('#startGame').listeners.click();
    assert.equal(page.requests.length, 0);
    assert.match(page.node('#wordBankStatus').textContent, /至少.*3/);
});
