/**
 * Svelte action: scales the element's font-size down so that no single word
 * exceeds the element's content width. Reacts to both container resizes and
 * text content changes, so it works in the live-preview builder.
 */
export function fitText(node: HTMLElement) {
	function measure() {
		// Reset to the CSS-declared base size before measuring.
		node.style.fontSize = '';

		const cs = getComputedStyle(node);
		const baseFontSize = parseFloat(cs.fontSize);
		const paddingH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
		const contentWidth = node.clientWidth - paddingH;

		if (contentWidth <= 0 || baseFontSize <= 0) return;

		// Measure each word in a hidden span that mirrors the heading's font.
		// text-transform is included so CSS-uppercased text is measured at its
		// rendered width (important for themes like Monumental and Declaration).
		const temp = document.createElement('span');
		temp.style.cssText =
			`position:absolute;visibility:hidden;white-space:nowrap;` +
			`font-family:${cs.fontFamily};font-size:${baseFontSize}px;` +
			`font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing};` +
			`text-transform:${cs.textTransform};font-style:${cs.fontStyle};`;
		document.body.appendChild(temp);

		let maxWordWidth = 0;
		for (const word of (node.textContent?.trim().split(/\s+/) ?? [])) {
			if (!word) continue;
			temp.textContent = word;
			maxWordWidth = Math.max(maxWordWidth, temp.offsetWidth);
		}
		document.body.removeChild(temp);

		if (maxWordWidth > 0 && maxWordWidth > contentWidth) {
			node.style.fontSize = `${baseFontSize * (contentWidth / maxWordWidth)}px`;
		}
	}

	measure();

	const ro = new ResizeObserver(measure);
	const mo = new MutationObserver(measure);

	ro.observe(node);
	mo.observe(node, { childList: true, characterData: true, subtree: true });

	return {
		destroy() {
			ro.disconnect();
			mo.disconnect();
		}
	};
}
