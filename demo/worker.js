import { createDynamicSVGImage, initializeFont } from '../src/index.js';
import { demoHTML } from './demo-content.js';
import satoshiFont from '../assets/Satoshi-Bold.ttf';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert font to base64 for embedding in SVG
const satoshiFontBase64 = arrayBufferToBase64(satoshiFont);
console.log(`Satoshi font loaded: ${satoshiFontBase64.substring(0, 100)}... (${satoshiFontBase64.length} chars)`);

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (request.method === 'GET') {
        const url = new URL(request.url);

        // Serve demo page
        if (url.pathname === '/' || url.pathname === '/demo') {
          try {
            return new Response(demoHTML, {
              headers: {
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*',
              },
            });
          } catch (error) {
            console.error('Failed to load demo HTML:', error);
          }
        }

        return new Response(`
🎨 OpenType.js SVG Generator API

🌟 Features:
✅ Accurate text measurement with OpenType.js
✅ Universal emoji & international text support (🌍 مرحبا 你好)
✅ Dynamic font sizing with real font metrics
✅ Background image support
✅ Fast SVG generation (no WASM overhead)
✅ Interactive demo interface

🚀 Endpoints:
- GET / or /demo - Interactive demo interface
- POST / - Generate SVG with JSON data

💻 API Usage:
curl -X POST http://localhost:8787 \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hello 🌍!", "width": 400, "height": 200, "autoFontSize": true}'

🎯 Try the demo: http://localhost:8787/
        `, {
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      if (request.method !== 'POST') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      const contentType = request.headers.get('Content-Type') || '';
      let options = {};

      if (contentType.includes('application/json')) {
        options = await request.json();
      } else {
        const formData = await request.formData();
        options = {};
        for (const [key, value] of formData.entries()) {
          if (key === 'width' || key === 'height' || key === 'fontSize' || key === 'textX' || key === 'textY' || key === 'maxFontSize') {
            options[key] = parseInt(value) || undefined;
          } else if (key === 'textColor' || key === 'backgroundColor') {
            try {
              options[key] = JSON.parse(value);
            } catch {
              options[key] = value;
            }
          } else {
            options[key] = value;
          }
        }
      }

      // ens-v2 only embeds data: URIs, so fetch the demo's image URL here the way the metadata service would.
      if (options.layout === 'ens-v2' && /^https?:\/\//.test(options.backgroundImageUrl || '')) {
        const imageResponse = await fetch(options.backgroundImageUrl);
        if (imageResponse.ok) {
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          options.backgroundImageUrl = `data:${contentType};base64,${arrayBufferToBase64(await imageResponse.arrayBuffer())}`;
        }
      }

      // Initialize Satoshi font for accurate text measurement
      await initializeFont(satoshiFont);

      // Add Satoshi font to options for embedding in SVG
      options.fontFamily = options.fontFamily || 'Satoshi';
      options.fontBase64 = satoshiFontBase64;

      const data = await createDynamicSVGImage(options);
      const base64Data = arrayBufferToBase64(data);

      const mimeType = 'image/svg+xml';

      const responseData = {
        success: true,
        image: `data:${mimeType};base64,${base64Data}`,
        base64: base64Data,
        format: 'svg'
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      console.error('Error generating image:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
