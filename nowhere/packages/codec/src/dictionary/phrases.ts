// Preset policy phrases for returns/refunds and warranty
// Compressed to 2-char codes during tag serialization (not dictionary substitution)
// APPEND-ONLY: phrases must only be added at the END of each array

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

function indexToCode(i: number): string {
	return CODE_CHARS[Math.floor(i / 64)] + CODE_CHARS[i % 64];
}

export const RETURN_PHRASES: string[] = [
	'All sales are final. No returns or refunds.',
	'All sales are final. No returns, exchanges, or refunds. Please review your order carefully before purchasing.',
	'Due to the nature of our products, all sales are final. We cannot accept returns or issue refunds.',
	'Digital products cannot be returned or refunded once delivered.',
	'Custom and personalized items cannot be returned or refunded.',
	'Due to the nature of digital goods, all sales are final. No refunds will be issued after delivery.',
	'Returns accepted only for defective or damaged items. Contact us within 7 days of delivery.',
	'Returns accepted only for defective or damaged items. Contact us within 14 days of delivery.',
	'Returns accepted only for defective or damaged items. Contact us within 30 days of delivery with photos of the issue.',
	'Returns accepted within 7 days of delivery. Items must be unused and in original packaging. Buyer pays return shipping.',
	'Returns accepted within 7 days of delivery. Items must be unused and in original condition. Refund issued after inspection.',
	'Returns accepted within 14 days of delivery. Items must be unused and in original packaging. Buyer pays return shipping.',
	'Returns accepted within 14 days of delivery. Items must be unused and in original condition. Refund issued after inspection.',
	'14-day return policy. Items must be unused, in original packaging, with all tags attached. Buyer pays return shipping. Refund issued within 5 business days of receiving the return.',
	'30-day money-back guarantee. If you are not satisfied, return the item in its original condition for a full refund.',
	'Returns accepted within 30 days of delivery. Items must be unused and in original packaging. Buyer pays return shipping.',
	'30-day return policy. Items must be unused and in original condition. Contact us to initiate a return. Refund issued after inspection.',
	'30-day hassle-free returns. Send it back for any reason. We will refund your purchase once we receive the item.',
	'We offer exchanges only, no refunds. Contact us within 14 days of delivery to arrange an exchange.',
	'Exchanges accepted within 30 days of delivery for a different size or color. No refunds.',
	'Returns accepted within 14 days for store credit only. Items must be unused and in original condition.',
	'Returns accepted within 30 days for store credit only. Items must be unused and in original packaging.',
	'Contact us before returning any item. Returns without prior approval will not be accepted.',
	'Please contact us with any issues. We handle returns and refunds on a case-by-case basis.',
];

export const WARRANTY_PHRASES: string[] = [
	'No warranty. Items are sold as-is.',
	'Items are sold as-is with no warranty. All sales are final.',
	'30-day warranty against defects in materials and workmanship.',
	'30-day limited warranty. Covers manufacturing defects only. Does not cover normal wear, misuse, or accidental damage.',
	'90-day warranty against defects in materials and workmanship.',
	'90-day limited warranty. Covers manufacturing defects only. Does not cover normal wear, misuse, or accidental damage.',
	'90-day warranty. If your item has a manufacturing defect, contact us for a free replacement.',
	'1-year warranty against defects in materials and workmanship.',
	'1-year limited warranty. Covers manufacturing defects only. Does not cover normal wear, misuse, or accidental damage.',
	'1-year warranty. If your item has a manufacturing defect, contact us for a free replacement or repair.',
	'1-year warranty from date of purchase. Covers defects in materials and workmanship. Contact us with your order details and photos of the issue.',
	'2-year warranty against defects in materials and workmanship.',
	'2-year limited warranty. Covers manufacturing defects only. Does not cover normal wear, misuse, or accidental damage.',
	'Lifetime warranty against defects in materials and workmanship. Contact us for a replacement.',
	'Lifetime limited warranty. Covers manufacturing defects only. Does not cover normal wear, misuse, or accidental damage.',
	'Lifetime warranty. We stand behind our products. If it breaks due to a defect, we will replace it free of charge.',
	'100% satisfaction guarantee. Not happy with your purchase? Contact us and we will make it right.',
	'We guarantee the quality of every item. If something is not right, contact us and we will resolve it.',
];

// Build lookup maps from combined list (returns first, then warranty)
const ALL_PHRASES = [...RETURN_PHRASES, ...WARRANTY_PHRASES];

export const phraseToCode = new Map<string, string>();
export const codeToPhrase = new Map<string, string>();

for (let i = 0; i < ALL_PHRASES.length; i++) {
	const code = indexToCode(i);
	phraseToCode.set(ALL_PHRASES[i], code);
	codeToPhrase.set(code, ALL_PHRASES[i]);
}

// Phrases sorted by length descending (for prefix matching longest-first)
export const sortedPhrasesDesc: [string, string][] = [...phraseToCode.entries()]
	.sort((a, b) => b[0].length - a[0].length);
