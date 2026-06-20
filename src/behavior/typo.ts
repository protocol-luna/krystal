const azertyAdjacent: Record<string, string[]> = {
	a: ["z", "q", "w"],
	z: ["a", "e", "s", "x"],
	e: ["z", "r", "d", "s"],
	r: ["e", "t", "f", "d"],
	t: ["r", "y", "g", "f"],
	y: ["t", "u", "h", "g"],
	u: ["y", "i", "j", "h"],
	i: ["u", "o", "k", "j"],
	o: ["i", "p", "l", "k"],
	p: ["o", "^", "l"],
	q: ["a", "s", "w"],
	s: ["q", "d", "z", "x"],
	d: ["s", "f", "e", "c"],
	f: ["d", "g", "r", "v"],
	g: ["f", "h", "t", "b"],
	h: ["g", "j", "y", "n"],
	j: ["h", "k", "u"],
	k: ["j", "l", "i"],
	l: ["k", "m", "o"],
	m: ["l", "ù", "p"],
	ù: ["m", "$", "è"],
	w: ["a", "x", "s"],
	x: ["w", "c", "z"],
	c: ["x", "v", "d"],
	v: ["c", "b", "f"],
	b: ["v", "n", "g"],
	n: ["b", "?", "h"],
};

const qwertyAdjacent: Record<string, string[]> = {
	q: ["w", "a"],
	w: ["q", "e", "a", "s"],
	e: ["w", "r", "s", "d"],
	r: ["e", "t", "d", "f"],
	t: ["r", "y", "f", "g"],
	y: ["t", "u", "g", "h"],
	u: ["y", "i", "h", "j"],
	i: ["u", "o", "j", "k"],
	o: ["i", "p", "k", "l"],
	p: ["o", "l"],
	a: ["q", "s", "z"],
	s: ["w", "a", "x", "d", "z"],
	d: ["e", "s", "c", "f", "x"],
	f: ["r", "d", "v", "g", "c"],
	g: ["t", "f", "b", "h", "v"],
	h: ["y", "g", "n", "j", "b"],
	j: ["u", "h", "m", "k", "n"],
	k: ["i", "j", "l"],
	l: ["o", "k", "m"],
	z: ["a", "x"],
	x: ["z", "c", "s"],
	c: ["x", "v", "d"],
	v: ["c", "b", "f"],
	b: ["v", "n", "g"],
	n: ["b", "m", "h"],
	m: ["n", "k", "j"],
};

export type TypoLayout = "azerty" | "qwerty";

export interface TypoResult {
	text: string;
	original: string;
	charIndex: number;
	originalChar: string;
	typoChar: string;
	originalWord: string;
	correctedWord: string;
}

function pickLetter(text: string): number | null {
	const letters = text.split("").map((c, i) => ({ c, i }));
	const candidates = letters.filter(({ c }) => /[a-zA-Z]/.test(c));
	if (candidates.length === 0) { return null; }
	return candidates[Math.floor(Math.random() * candidates.length)].i;
}

export function applyTypo(text: string, layout: TypoLayout): TypoResult | null {
	const map = layout === "azerty" ? azertyAdjacent : qwertyAdjacent;
	const idx = pickLetter(text);
	if (idx === null) { return null; }

	const originalChar = text[idx].toLowerCase();
	const adjacent = map[originalChar];
	if (!adjacent || adjacent.length === 0) { return null; }

	const typoChar = adjacent[Math.floor(Math.random() * adjacent.length)];
	const typed =
		text[idx] === originalChar ? typoChar : typoChar.toUpperCase();
	const newText = text.slice(0, idx) + typed + text.slice(idx + 1);

	const wordStart = text.slice(0, idx).search(/\S*$/);
	const wordEnd = text.slice(idx).search(/\s|$/) + idx;
	const originalWord = text.slice(wordStart, wordEnd);
	const correctedWord = newText.slice(wordStart, wordEnd);

	return { text: newText, original: text, charIndex: idx, originalChar, typoChar, originalWord, correctedWord };
}
