const WordBank = (() => {
    const maxBytes = 16 * 1024;
    function normalizeWords(input, minimum = 0) {
        if (!Array.isArray(input) || input.length > 100) throw new Error('词库最多包含 100 个词语');
        const words = [...new Set(input.map((word) => {
            if (typeof word !== 'string' || word.length > 40) throw new Error('每个词语不能超过 40 字');
            // eslint-disable-next-line no-control-regex
            if (/[\u0000-\u001f\u007f]/.test(word)) throw new Error('词语不能包含控制字符');
            const clean = word.trim();
            if (!clean) throw new Error('词语不能为空');
            return clean;
        }))];
        if (words.length < minimum) throw new Error('词库至少需要 3 个不同词语');
        return words;
    }

    function parseText(text, minimum = 3) {
        if (new TextEncoder().encode(text).length > maxBytes) throw new Error('词库文件不能超过 16 KB');
        const lines = text.replace(/^\ufeff/, '').split(/\r\n|\n|\r/).map((word) => word.trim()).filter(Boolean);
        return normalizeWords([...new Set(lines)], minimum);
    }

    return { maxBytes, normalizeWords, parseText };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WordBank;
