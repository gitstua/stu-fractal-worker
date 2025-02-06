/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { checkRateLimit } from './rateLimit';
import { createMinimalBMP } from './imageGenerators/bmp';
import { createMinimalPNG } from './imageGenerators/png';
import { generateFractal } from './fractal';

export default {
	async fetch(request, env, ctx) {
		// Check rate limit
		const isAllowed = await checkRateLimit(request, env);
		if (!isAllowed) {
			return new Response('Rate limit exceeded. Try again later.', { status: 429 });
		}

		const url = new URL(request.url);
		
		// Parse URL parameters
		const seedParam = url.searchParams.get('seed');
		const typeParam = url.searchParams.get('type');
		const widthParam = url.searchParams.get('width');
		const heightParam = url.searchParams.get('height');
		const bmpParam = url.searchParams.get('bmp');
		const iterParam = url.searchParams.get('iter');
		const useBmp = bmpParam !== 'false'; // defaults to true
		const seed = seedParam ? parseInt(seedParam) : Math.floor(Math.random() * 1000000);
		
		// Set size limits based on format
		const maxWidth = useBmp ? 800 : 320;
		const maxHeight = useBmp ? 600 : 200;

		// Apply size limits
		const requestedWidth = widthParam ? parseInt(widthParam) : 720;
		const requestedHeight = heightParam ? parseInt(heightParam) : 432;
		
		const width = Math.min(requestedWidth, maxWidth);
		const height = Math.min(requestedHeight, maxHeight);
		
		// Parse iterations parameter with a default of 50 and a maximum of 800
		const maxIter = Math.min(iterParam ? parseInt(iterParam) : 50, 800);
		
		// Simple random number generator with seed
		const random = (() => {
			let state = seed;
			return () => {
				state = (state * 1664525 + 1013904223) >>> 0;
				return state / 0xFFFFFFFF;
			};
		})();
		
		// Randomly choose fractal type if not specified
		const fractalType = typeParam || (random() < 0.5 ? 'mandelbrot' : 'julia');
		
		// Generate fractal
		const pixelData = generateFractal(width, height, maxIter, seed, fractalType);

		// Return response
		if (useBmp) {
			const bmpData = createMinimalBMP(width, height, pixelData);
			return new Response(bmpData, {
				headers: {
					'Content-Type': 'image/bmp',
					'Content-Disposition': `inline; filename="fractal-${seed}.bmp"`,
					'X-Fractal-Seed': seed.toString()
				}
			});
		} else {
			const pngData = createMinimalPNG(width, height, pixelData);
			return new Response(pngData, {
				headers: {
					'Content-Type': 'image/png',
					'Content-Disposition': `inline; filename="fractal-${seed}.png"`,
					'X-Fractal-Seed': seed.toString()
				}
			});
		}
	}
};