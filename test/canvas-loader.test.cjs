const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
function page() {
    const scripts = [];
    function node() {
        return { listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; }, setAttribute() {}, remove() {} };
    }
    const context = vm.createContext({
        URLSearchParams,
        io: () => ({ on() {} }), Howl: function Howl() {},
        window: { location: { toString: () => 'http://game.test/' } },
        document: { querySelector: node, createElement: node, body: { append(script) { scripts.push(script); } } },
    });
    vm.runInContext(readFileSync('public/js/settings.js', 'utf8'), context);
    return { scripts, context, load: () => vm.runInContext('loadCanvas()', context) };
}

test('a failed Sketchpad download can be retried on the next game', async () => {
    const browser = page();
    const first = browser.load();
    const rejection = assert.rejects(first, /绘图组件加载失败/);
    browser.scripts[0].listeners.error();
    await rejection;
    const retry = browser.load();
    assert.notEqual(retry, first);
    assert.equal(browser.scripts.length, 2);
    vm.runInContext('var Sketchpad = function Sketchpad() {}', browser.context);
    browser.scripts[1].listeners.load();
    browser.scripts[2].listeners.load();
    await retry;
    assert.equal(browser.load(), retry);
});

test('a canvas script retry preserves the already loaded Sketchpad stage', async () => {
    const browser = page();
    const first = browser.load();
    vm.runInContext('var Sketchpad = function Sketchpad() {}', browser.context);
    browser.scripts[0].listeners.load();
    const rejection = assert.rejects(first, /画布加载失败/);
    browser.scripts[1].listeners.error();
    await rejection;
    const retry = browser.load();
    assert.notEqual(retry, first);
    assert.equal(browser.scripts.length, 3);
    assert.equal(browser.scripts[2].src, 'js/canvas.js');
    browser.scripts[2].listeners.load();
    await retry;
});
