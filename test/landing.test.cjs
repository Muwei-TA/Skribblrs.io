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
        assert.equal(html.includes('dicebear.com'), false);
        assert.equal(html.includes('头像风格'), false);
        assert.equal(html.includes('背景颜色'), false);
    }
});

test('saved external avatars are replaced locally and nickname edits never request avatars', () => {
    const stored = new Map([
        ['name', '小明 / &?'],
        ['avatar', 'https://api.dicebear.com/9.x/avataaars/svg'],
        ['avatarStyle', 'bottts'],
        ['avatarBackground', '#ffffff'],
    ]);
    const playerName = { value: '', addEventListener(event, callback) { this[event] = callback; } };
    const context = vm.createContext({
        localStorage: {
            getItem: (key) => stored.get(key) || null,
            setItem: (key, value) => stored.set(key, value),
            removeItem: (key) => stored.delete(key),
        },
        document: {
            querySelector: () => playerName,
            createElement(tag) { assert.equal(tag, 'script'); return {}; },
            body: { append() {} },
        },
    });
    vm.runInContext(readFileSync('public/js/avatar.js', 'utf8'), context);
    assert.equal(vm.runInContext('my.avatar', context), '/images/avatar-default.svg');
    assert.equal(stored.get('avatar'), '/images/avatar-default.svg');
    assert.equal(stored.has('avatarStyle'), false);
    assert.equal(stored.has('avatarBackground'), false);
    assert.equal(playerName.value, '小明 / &?');
    playerName.value = '新昵称';
    playerName.input();
    assert.equal(stored.get('name'), '新昵称');
    assert.equal(vm.runInContext('my.name', context), '新昵称');
    assert.equal(vm.runInContext('my.avatar', context), '/images/avatar-default.svg');
});
