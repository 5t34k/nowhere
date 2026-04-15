import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	define: {
		__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
	},
	plugins: [sveltekit()],
	server: {
		port: 5174,
		fs: {
			allow: [
				path.resolve('../nowhere/packages/web/src'),
				path.resolve('../nowhere/packages/codec')
			]
		}
	}
});
