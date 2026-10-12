const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync } = require('node:fs');
function matcher() {
    assert.ok(existsSync('controllers/answers.js'), 'Chinese answer matcher must exist');
    return require('../controllers/answers');
}

test('Chinese answer matching accepts documented synonyms in both directions', () => {
    const { matchesAnswer } = matcher();
    for (const [word, guess] of [['自行车', '单车'], ['单车', '自行车'], ['公共汽车', '公交车'], ['土豆', '马铃薯'], ['西红柿', '番茄']]) {
        assert.equal(matchesAnswer(word, guess), true);
    }
});

test('answer matching normalizes surrounding whitespace, full-width forms and letter case', () => {
    const { matchesAnswer } = matcher();
    assert.equal(matchesAnswer('苹果', ' 苹果 '), true);
    assert.equal(matchesAnswer('ABC', 'ａｂｃ'), true);
    assert.equal(matchesAnswer('Hot Dog', ' hot dog '), true);
});

test('answer matching rejects typos, homophones, partial words and unrelated custom terms', () => {
    const { matchesAnswer } = matcher();
    for (const [word, guess] of [['苹果', '平果'], ['自行车', '自行'], ['飞机', '飞鸡'], ['火车', '汽车'], ['自定义词', '未知别名']]) {
        assert.equal(matchesAnswer(word, guess), false);
    }
});
