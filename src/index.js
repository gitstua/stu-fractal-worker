/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx) {
		// Parse URL parameters
		const url = new URL(request.url);
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
		
		const pixelData = new Uint8Array(width * height * 4);
		
		// Parameters that vary with seed and fractal type
		const zoom = 2.8 + random() * 0.8;
		let centerX = -0.65 + (random() - 0.5) * 0.3;
		let centerY = (random() - 0.5) * 0.3;

		// Julia set parameters (when needed)
		const juliaX = -0.4 + random() * 0.8;
		const juliaY = -0.4 + random() * 0.8;

		// Adjust parameters based on fractal type
		if (fractalType === 'julia') {
			centerX = 0;
			centerY = 0;
		}

		// Fractal Generation (8-bit)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let zx = 0, zy = 0;
				const cx = (x - width / 2) * zoom / width + centerX;
				const cy = (y - height / 2) * zoom / height + centerY;

				// Initialize based on fractal type
				if (fractalType === 'julia') {
					zx = cx;
					zy = cy;
				}

				let i = 0;
				while (zx * zx + zy * zy <= 4 && i < maxIter) {
					let temp;
					switch (fractalType) {
						case 'julia':
							temp = zx * zx - zy * zy + juliaX;
							zy = 2 * zx * zy + juliaY;
							zx = temp;
							break;

						case 'burningship':
							temp = zx * zx - zy * zy + cx;
							zy = Math.abs(2 * zx * zy) + cy;
							zx = temp;
							break;

						default: // mandelbrot
							temp = zx * zx - zy * zy + cx;
							zy = 2 * zx * zy + cy;
							zx = temp;
					}
					i++;
				}
				
		  // Simple grayscale coloring
		  if (i === maxIter) {
			pixelData[y * width + x] = 0; // Black for points inside set
		  } else {
			// Basic gradient
			pixelData[y * width + x] = Math.floor(255 * Math.sqrt(i / maxIter));
		  }
		}
	  }
		
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

// Simple PNG encoder for 8-bit grayscale images
function createMinimalPNG(width, height, pixelData) {
	const crc32 = (buf) => {
	  const table = new Uint32Array(256).map((_, i) => {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
		return c;
	  });
	  let crc = ~0;
	  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
	  return ~crc >>> 0;
	};
  
	const adler32 = (buf) => {
	  let a = 1, b = 0;
	  for (const byte of buf) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	  }
	  return (b << 16) | a;
	};
  
	const toBigEndian = (num) => {
	  const arr = new Uint8Array(4);
	  arr[0] = (num >> 24) & 0xff;
	  arr[1] = (num >> 16) & 0xff;
	  arr[2] = (num >> 8) & 0xff;
	  arr[3] = num & 0xff;
	  return arr;
	};
  
	const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const header = new Uint8Array([
	  ...toBigEndian(13), // Chunk length
	  ...[73, 72, 68, 82], // 'IHDR'
	  ...toBigEndian(width),
	  ...toBigEndian(height),
	  8, // Bit depth (8-bit)
	  0, // Color type (grayscale)
	  0, // Compression
	  0, // Filter
	  0, // Interlace
	]);
	const headerCRC = toBigEndian(crc32(header.slice(4)));
  
	// PNG requires each row to be prefixed with a filter byte (0 for none)
	const scanlines = new Uint8Array(width * height + height);
	for (let y = 0; y < height; y++) {
	  scanlines[y * (width + 1)] = 0; // No filter
	  scanlines.set(pixelData.slice(y * width, (y + 1) * width), y * (width + 1) + 1);
	}
  
	// zlib compression (uncompressed block)
	const zlibHeader = new Uint8Array([0x78, 0x01]); // DEFLATE with no compression
	const blockHeader = new Uint8Array([
	  0x01, // Final block flag + Type 00 (no compression)
	  scanlines.length & 0xFF,
	  (scanlines.length >> 8) & 0xFF,
	  (~scanlines.length & 0xFF),
	  (~(scanlines.length >> 8) & 0xFF),
	]);
  
	const deflate = new Uint8Array([
	  ...zlibHeader,
	  ...blockHeader,
	  ...scanlines,
	  ...toBigEndian(adler32(scanlines))
	]);
  
	const dataChunk = new Uint8Array([
	  ...toBigEndian(deflate.length),
	  ...[73, 68, 65, 84], // 'IDAT'
	  ...deflate,
	  ...toBigEndian(crc32(new Uint8Array([73, 68, 65, 84, ...deflate])))
	]);
  
	const endChunk = new Uint8Array([
	  ...toBigEndian(0), // Length
	  ...[73, 69, 78, 68], // 'IEND'
	  ...toBigEndian(crc32(new Uint8Array([73, 69, 78, 68])))
	]);
  
	return new Uint8Array([...signature, ...header, ...headerCRC, ...dataChunk, ...endChunk]);
}

function createMinimalBMP(width, height, pixelData) {
	const rowSize = Math.floor((width * 8 + 31) / 32) * 4;
	const imageSize = rowSize * height;
	const paletteSize = 256 * 4; // 256 colors * 4 bytes each
	const headerSize = 54; // BMP header (14) + DIB header (40)
	const fileSize = headerSize + paletteSize + imageSize;

	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);

	// BMP Header
	view.setUint16(0, 0x4D42, true); // BM
	view.setUint32(2, fileSize, true);
	view.setUint32(6, 0, true); // Reserved
	view.setUint32(10, headerSize + paletteSize, true); // Pixel data offset

	// DIB Header
	view.setUint32(14, 40, true); // DIB header size
	view.setInt32(18, width, true);
	view.setInt32(22, -height, true); // Negative height for top-down image
	view.setUint16(26, 1, true); // Color planes
	view.setUint16(28, 8, true); // Bits per pixel (8-bit grayscale)
	view.setUint32(30, 0, true); // No compression
	view.setUint32(34, imageSize, true);
	view.setInt32(38, 2835, true); // X pixels per meter (~72 DPI)
	view.setInt32(42, 2835, true); // Y pixels per meter
	view.setUint32(46, 256, true); // Color palette size
	view.setUint32(50, 256, true); // Important colors

	// Grayscale color palette
	for (let i = 0; i < 256; i++) {
		const offset = headerSize + i * 4;
		view.setUint8(offset, i);     // Blue
		view.setUint8(offset + 1, i); // Green
		view.setUint8(offset + 2, i); // Red
		view.setUint8(offset + 3, 0); // Reserved
	}

	// Pixel data
	const dataOffset = headerSize + paletteSize;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			view.setUint8(dataOffset + y * rowSize + x, pixelData[y * width + x]);
		}
		// Pad row to 4-byte boundary if needed
		for (let x = width; x < rowSize; x++) {
			view.setUint8(dataOffset + y * rowSize + x, 0);
		}
	}

	return new Uint8Array(buffer);
}