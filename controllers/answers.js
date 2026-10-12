const groups = require('../word-aliases.json');
const normalize = (word) => word.normalize('NFKC').trim().toLowerCase();
const aliases = new Map();
groups.forEach((group) => {
    const accepted = new Set(group.map(normalize));
    accepted.forEach((word) => aliases.set(word, accepted));
});

function matchesAnswer(word, guess) {
    const answer = normalize(word);
    const input = normalize(guess);
    return input === answer || (aliases.get(answer)?.has(input) ?? false);
}

module.exports = { matchesAnswer };
