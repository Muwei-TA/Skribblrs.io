const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ejs = require('ejs');

test('host and invitation pages explain the game and the purpose of the avatar', async () => {
    for (const roomID of [undefined, 'invited-room']) {
        const html = await ejs.renderFile('views/index.ejs', { roomID });
        assert.ok(/<h1[^>]*>你画我猜<\/h1>/.test(html));
        for (const text of ['怎么玩', '邀请好友', '轮流绘画', '猜词得分', '这是你的游戏头像']) assert.ok(html.includes(text), text);
        assert.ok(html.includes('src="/images/avatar-default.svg"'));
        assert.equal(html.includes('avatars.dicebear.com'), false);
    }
});

function avatarPage() {
    const stored = new Map([['name', '小明 / &?'], ['avatar', 'https://avatars.dicebear.com/api/avataaars/old.svg']]);
    const elements = new Map();
    const images = [];
    let displayed;
    function element() {
        return { value: '', listeners: {}, classList: { add() {} },
            addEventListener(event, callback) { this.listeners[event] = callback; },
            setAttribute(name, value) { this[name] = value; },
            replaceWith(next) { displayed = next; elements.set('#avatar', next); } };
    }
    for (const id of ['#style', '#bgColor', '#playerName', '#avatar']) elements.set(id, element());
    elements.get('#style').value = 'avataaars';
    elements.get('#style').options = ['avataaars', 'bottts', 'adventurer', 'lorelei', 'identicon', 'initials'].map((value) => ({ value }));
    elements.get('#bgColor').value = '#ffffff';
    const context = vm.createContext({
        URLSearchParams,
        localStorage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
        document: { querySelector: (selector) => elements.get(selector), body: { append() {} },
            createElement(tag) { const node = element(); if (tag === 'img') images.push(node); return node; } },
        window: {},
    });
    vm.runInContext(readFileSync('public/js/avatar.js', 'utf8'), context);
    if (context.window.onload) context.window.onload();
    return { context, stored, elements, images, displayed: () => displayed };
}

test('saved legacy avatars migrate to a current URL with an encoded nickname', () => {
    const page = avatarPage();
    const url = new URL(vm.runInContext('my.avatar', page.context));
    assert.equal(url.origin, 'https://api.dicebear.com');
    assert.equal(url.pathname, '/9.x/avataaars/svg');
    assert.equal(url.searchParams.get('seed'), '小明 / &?');
    assert.equal(url.searchParams.get('backgroundColor'), 'ffffff');
    assert.equal(page.elements.get('#playerName').value, '小明 / &?');
});

test('avatar failures use a local image and stale requests cannot replace the current selection', () => {
    const page = avatarPage();
    const first = page.images.at(-1);
    page.elements.get('#style').value = 'bottts';
    page.elements.get('#style').listeners.input();
    const current = page.images.at(-1);
    first.listeners.error();
    assert.equal(new URL(vm.runInContext('my.avatar', page.context)).pathname, '/9.x/bottts/svg');
    current.listeners.error();
    current.listeners.load();
    assert.equal(vm.runInContext('my.avatar', page.context), '/images/avatar-default.svg');
    assert.equal(page.displayed().src, '/images/avatar-default.svg');
    assert.equal(page.stored.get('avatar'), '/images/avatar-default.svg');
});

test('late avatar responses do not crash after the player has entered a room', () => {
    const page = avatarPage();
    page.elements.delete('#avatar');
    const image = page.images.at(-1);
    assert.doesNotThrow(() => { image.listeners.error(); image.listeners.load(); });
});
