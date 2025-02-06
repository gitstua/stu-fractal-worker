/**
 * Fractal image generation API using Cloudflare Workers
 * 
 * This worker generates grayscale fractal images (Mandelbrot and Julia sets)
 * with configurable parameters via URL query strings:
 * 
 * - seed: Random seed for consistent results (default: random)
 * - type: 'mandelbrot' or 'julia' (default: random)
 * - width: Image width in pixels (max 800 for BMP, 320 for PNG)
 * - height: Image height in pixels (max 600 for BMP, 200 for PNG) 
 * - iter: Maximum iterations for detail level (default: 50, max: 800)
 * - bmp: Use BMP format if 'true', PNG if 'false' (default: true)
 * 
 * Rate limiting is applied per IP address to prevent abuse.
 * 
 * Dependencies:
 * - Cloudflare Workers KV namespace bound as RATE_LIMIT for rate limiting
 * - Web Crypto API (available by default in Workers runtime)
 * - Optional environment variable RATE_LIMIT_PER_IP to configure rate limit
 * 
 * Internal modules:
 * - rateLimit.js: Rate limiting functionality
 * - imageGenerators/bmp.js: BMP image format generation
 * - imageGenerators/png.js: PNG image format generation
 * - fractal.js: Core fractal generation algorithms
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