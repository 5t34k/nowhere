// Tier 1 words: 1-char codes using A-Za-z0-9_-
// Reserved chars that CANNOT be used as Tier 1 codes:
//   ~ (sentinel), ! (capitalization marker), U (URL prefix marker)
//
// Stripped of all guesswork. What remains is only the floor: English function
// words and the URL pattern shortcuts. Every other slot is empty, waiting for
// Step 7 of the dictionary rebuild plan to fill them with data-driven choices
// from the new Tier 2 candidate list.
//
// Until launch, this list is mutable. After launch it becomes APPEND-ONLY.
export const TIER1_WORDS: [string, string][] = [
	// Function words (universal across all 8 site types)
	['the', 'A'],
	['and', 'B'],
	['for', 'C'],
	['that', 'D'],
	['this', 'F'],
	['with', 'G'],
	['have', 'c'],

	// URL patterns (universal)
	['.com.', 'k'],
	['.com/', 'l'],
	['.com', 'm'],
	['https://', 'n']
];

// Build lookup maps for Tier 1 only
const wordToCode = new Map<string, string>();
const codeToWord = new Map<string, string>();

for (const [word, code] of TIER1_WORDS) {
	wordToCode.set(word, code);
	codeToWord.set(code, word);
}

// Tier 1 words sorted by length descending for longest-match-first
const sortedWords = [...wordToCode.entries()].sort((a, b) => b[0].length - a[0].length);

export { wordToCode, codeToWord, sortedWords };
