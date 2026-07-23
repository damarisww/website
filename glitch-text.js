/* Occasional text glitches in project copy (desktop + mobile). */
(function () {
    const PUNC_POOL = [
        '/', ',', '.', ':', ';', '*', '-', '_', '|', '+',
        '(', ')', '[', ']', '<', '>', '{', '}',
        '!', '?', '#', '%', '&', '=', '~', '^'
    ];
    const DIGITS = '0123456789';

    const ROOT_SELECTOR = [
        '.project-description',
        '#cursor-instruction',
        '#floating-text-container'
    ].join(', ');

    const PROJECT_TEXT_SELECTOR = '.project-description';

    const SKIP_CLOSEST = '#nav-container, script, style, noscript, #archive-hint, #archive-intro-veil';

    let busy = false;

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function typeDelay() {
        let ms = rand(70, 130);
        if (Math.random() < 0.12) ms += rand(80, 180);
        if (Math.random() < 0.06) ms += rand(160, 280);
        return ms;
    }

    function deleteDelay() {
        let ms = rand(55, 100);
        if (Math.random() < 0.1) ms += rand(60, 140);
        return ms;
    }

    function collectTextNodes(rootSelector) {
        const roots = document.querySelectorAll(rootSelector);
        const nodes = [];
        roots.forEach(root => {
            if (!root || root.closest(SKIP_CLOSEST)) return;
            if (root.id === 'cursor-instruction' && !root.textContent.trim()) return;
            // Only glitch project text when it is actually shown
            if (root.classList.contains('project-description') || root.id === 'floating-text-container') {
                const wrap = root.closest('#floating-text-container') || root;
                const style = window.getComputedStyle(wrap);
                if (style.display === 'none' || style.visibility === 'hidden') return;
            }
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.closest(SKIP_CLOSEST)) return NodeFilter.FILTER_REJECT;
                    if (parent.closest('.close-trigger')) return NodeFilter.FILTER_REJECT;
                    const text = node.nodeValue;
                    if (!text || text.trim().length < 3) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = walker.nextNode())) nodes.push(n);
        });
        return nodes;
    }

    function makeJunk() {
        const len = 4 + Math.floor(Math.random() * 12); // 4–15
        let junk = '';
        for (let i = 0; i < len; i++) junk += pick(PUNC_POOL);
        return junk;
    }

    function letterPositions(text) {
        const positions = [];
        for (let i = 0; i < text.length; i++) {
            if (/[A-Za-zÄÖÜäöüß]/.test(text[i])) positions.push(i);
        }
        return positions;
    }

    async function glitchPunctuation(node) {
        const original = node.nodeValue;
        if (!original || original.trim().length < 3) return;

        let start = 0;
        let end = original.length;
        while (start < end && /\s/.test(original[start])) start += 1;
        while (end > start && /\s/.test(original[end - 1])) end -= 1;
        if (end - start < 2) return;

        const pos = start + 1 + Math.floor(Math.random() * Math.max(1, end - start - 1));
        const junk = makeJunk();

        await sleep(rand(40, 120));

        for (let i = 0; i < junk.length; i++) {
            if (!node.parentNode) return;
            node.nodeValue = original.slice(0, pos) + junk.slice(0, i + 1) + original.slice(pos);
            await sleep(typeDelay());
        }

        await sleep(rand(280, 520));

        for (let i = junk.length - 1; i >= 0; i--) {
            if (!node.parentNode) return;
            node.nodeValue = original.slice(0, pos) + junk.slice(0, i) + original.slice(pos);
            await sleep(deleteDelay());
        }

        if (node.parentNode) node.nodeValue = original;
        await sleep(rand(120, 260));
    }

    // Flicker a letter to a digit, then restore so the text stays readable
    async function glitchLetterToNumber(node) {
        const original = node.nodeValue;
        if (!original) return;

        const letters = letterPositions(original);
        if (!letters.length) return;

        const pos = pick(letters);
        const digit = pick(DIGITS.split(''));
        const before = original.slice(0, pos);
        const letter = original[pos];
        const after = original.slice(pos + 1);

        // 1–3 quick flickers: letter → number → letter
        const flashes = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < flashes; i++) {
            if (!node.parentNode) return;
            node.nodeValue = before + digit + after;
            await sleep(rand(70, 140));
            if (!node.parentNode) return;
            node.nodeValue = before + letter + after;
            await sleep(rand(50, 110));
        }

        if (node.parentNode) node.nodeValue = original;
    }

    async function runGlitch() {
        // Number swaps are the more common glitch on project text
        const useNumber = Math.random() < 0.62;
        const nodes = collectTextNodes(useNumber ? PROJECT_TEXT_SELECTOR : ROOT_SELECTOR);
        if (!nodes.length) {
            const fallback = collectTextNodes(ROOT_SELECTOR);
            if (!fallback.length) return;
            await glitchPunctuation(pick(fallback));
            return;
        }

        if (useNumber) await glitchLetterToNumber(pick(nodes));
        else await glitchPunctuation(pick(nodes));
    }

    async function tick() {
        if (busy || document.hidden) return;

        busy = true;
        try {
            await runGlitch();
            if (Math.random() < 0.45) {
                await sleep(rand(350, 900));
                await runGlitch();
            }
        } finally {
            busy = false;
        }
    }

    function schedule() {
        const delay = rand(1400, 3600);
        setTimeout(async () => {
            if (Math.random() < 0.92) await tick();
            schedule();
        }, delay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    } else {
        schedule();
    }
})();
