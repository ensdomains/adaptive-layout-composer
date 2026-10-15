export const demoHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Canvas CF Worker - Dynamic Font Sizing Demo</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }

        .content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            padding: 30px;
        }

        .controls {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .form-group label {
            font-weight: 600;
            color: #2c3e50;
            font-size: 0.9rem;
        }

        .form-group input, .form-group textarea, .form-group select {
            padding: 12px 16px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.2s ease;
        }

        .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
            outline: none;
            border-color: #3498db;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
            font-family: inherit;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .controls.v2 .classic-only {
            display: none !important;
        }

        .color-input {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .color-picker {
            width: 50px;
            height: 40px;
            border: 2px solid #e1e5e9;
            border-radius: 6px;
            cursor: pointer;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 5px;
        }

        .checkbox-group input[type="checkbox"] {
            width: 20px;
            height: 20px;
        }

        .button-group {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 10px;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: #3498db;
            color: white;
        }

        .btn-primary:hover {
            background: #2980b9;
            transform: translateY(-1px);
        }

        .btn-secondary {
            background: #95a5a6;
            color: white;
        }

        .btn-secondary:hover {
            background: #7f8c8d;
        }

        .btn-random {
            background: #e74c3c;
            color: white;
        }

        .btn-random:hover {
            background: #c0392b;
        }

        .preview-section {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .preview-container {
            border: 2px solid #e1e5e9;
            border-radius: 12px;
            padding: 20px;
            background: #f8f9fa;
            text-align: center;
            min-height: 400px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .preview-image {
            max-width: 100%;
            max-height: 350px;
            border-radius: 8px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .loading {
            color: #7f8c8d;
            font-style: italic;
        }

        .error {
            color: #e74c3c;
            background: #fdf2f2;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #fecaca;
        }

        .metrics {
            background: #e8f4f8;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
        }

        .metrics h4 {
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .sample-texts {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }

        .sample-text {
            background: #ecf0f1;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.2s ease;
        }

        .sample-text:hover {
            background: #3498db;
            color: white;
        }

        @media (max-width: 768px) {
            .content {
                grid-template-columns: 1fr;
                gap: 20px;
            }

            .form-row {
                grid-template-columns: 1fr;
            }

            .button-group {
                flex-direction: column;
            }
        }

        .url-examples {
            font-size: 0.8rem;
            color: #7f8c8d;
            margin-top: 5px;
        }

        .url-examples a {
            color: #3498db;
            text-decoration: none;
        }

        .url-examples a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 ENS style Image Generator</h1>
            <p>Dynamic Font Sizing with Text Measurement & Background Images</p>
        </div>

        <div class="content">
            <div class="controls">
                <div class="form-group">
                    <label for="text">Domain Name</label>
                    <textarea id="text" placeholder="Enter domain name...">google.eth</textarea>
                    <div class="sample-texts">
                        <span class="sample-text" onclick="setText('google.eth')">google.eth</span>
                        <span class="sample-text" onclick="setText('🌟star.eth')">🌟star.eth</span>
                        <span class="sample-text" onclick="setText('🎮gaming.eth')">🎮gaming.eth</span>
                        <span class="sample-text" onclick="setText('🚀rocket.eth')">🚀rocket.eth</span>
                        <span class="sample-text" onclick="setText('你好.eth')">你好.eth (Chinese)</span>
                        <span class="sample-text" onclick="setText('مرحبا.eth')">مرحبا.eth (Arabic)</span>
                        <span class="sample-text" onclick="setText('こんにちは.eth')">こんにちは.eth (Japanese)</span>
                        <span class="sample-text" onclick="setText('שלום.eth')">שלום.eth (Hebrew)</span>
                        <span class="sample-text" onclick="setText('नमस्ते.eth')">नमस्ते.eth (Hindi)</span>
                        <span class="sample-text" onclick="setText('გამარჯობა.eth')">გამარჯობა.eth (Georgian)</span>
                        <span class="sample-text" onclick="setText('γεια.eth')">γεια.eth (Greek)</span>
                        <span class="sample-text" onclick="setText('привет.eth')">привет.eth (Russian)</span>
                        <span class="sample-text" onclick="setText('加密货币.eth')">加密货币.eth (Chinese)</span>
                        <span class="sample-text" onclick="setText('🌍world-مرحبا.eth')">Mixed</span>
                        <span class="sample-text" onclick="setText('crypto🏦bank.eth')">crypto🏦bank.eth</span>
                        <span class="sample-text" onclick="setText('デジタル💎art.eth')">デジタル💎art.eth</span>
                        <span class="sample-text" onclick="setText('verylongdomainname.eth')">Long Domain</span>
                    </div>
                </div>

                <div class="form-group">
                    <label for="layout">Layout</label>
                    <select id="layout">
                        <option value="ensStyle">ENS style (current)</option>
                        <option value="ens-v2">ENS v2</option>
                    </select>
                </div>

                <div id="v2Controls" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="labelColor">Label</label>
                            <input type="color" id="labelColor" class="color-picker" value="#F6FBFD">
                        </div>
                        <div class="form-group">
                            <label for="accentColor">Accent</label>
                            <input type="color" id="accentColor" class="color-picker" value="#0082BB">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="logoColor">Logo</label>
                            <input type="color" id="logoColor" class="color-picker" value="#F6FBFD">
                        </div>
                        <div class="form-group">
                            <label for="v2BackgroundColor">Background (no image)</label>
                            <input type="color" id="v2BackgroundColor" class="color-picker" value="#F6FBFD">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="backgroundMarkup">Background Markup (optional, SVG fragment)</label>
                        <textarea id="backgroundMarkup" placeholder="<g>...</g> — used when there is no background image"></textarea>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="width">Width (px)</label>
                        <input type="number" id="width" value="518" min="100" max="1200">
                    </div>
                    <div class="form-group">
                        <label for="height">Height (px)</label>
                        <input type="number" id="height" value="518" min="100" max="800">
                    </div>
                </div>

                <div class="form-group">
                    <label for="backgroundImageUrl">Background Image URL (optional)</label>
                    <input type="url" id="backgroundImageUrl" placeholder="https://example.com/image.jpg">
                    <div class="url-examples">
                        Try: <a href="#" onclick="setRandomBackground()">Random Image</a> •
                        <a href="#" onclick="setBackground('https://picsum.photos/800/800')">Picsum</a>
                    </div>
                </div>

                <div class="form-row classic-only">
                    <div class="form-group">
                        <label>Text Color</label>
                        <div class="color-input">
                            <input type="color" id="textColorPicker" class="color-picker" value="#ffffff">
                            <input type="text" id="textColor" value="255,255,255,1" placeholder="R,G,B,A">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Gradient Style</label>
                        <select id="gradientStyle">
                            <option value="ens">ENS Blue/Purple</option>
                            <option value="custom">Custom Gradient</option>
                            <option value="solid">Solid Color</option>
                        </select>
                    </div>
                </div>

                <div class="form-row classic-only" id="gradientControls">
                    <div class="form-group">
                        <label>Gradient Start</label>
                        <div class="color-input">
                            <input type="color" id="gradientStartPicker" class="color-picker" value="#667eea">
                            <input type="text" id="gradientStart" value="102,126,234,1" placeholder="R,G,B,A">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Gradient End</label>
                        <div class="color-input">
                            <input type="color" id="gradientEndPicker" class="color-picker" value="#764ba2">
                            <input type="text" id="gradientEnd" value="118,75,162,1" placeholder="R,G,B,A">
                        </div>
                    </div>
                </div>

                <div class="form-row classic-only">
                    <div class="form-group">
                        <label for="maxTextWidth">Max Text Width (px)</label>
                        <input type="number" id="maxTextWidth" placeholder="Auto (80% of width)">
                    </div>
                    <div class="form-group">
                        <label for="fontSize">Manual Font Size (px)</label>
                        <input type="number" id="fontSize" placeholder="Auto-calculated">
                    </div>
                </div>

                <div class="checkbox-group classic-only">
                    <input type="checkbox" id="autoFontSize" checked>
                    <label for="autoFontSize">Enable Auto Font Sizing</label>
                </div>

                <div class="button-group">
                    <button class="btn btn-primary" onclick="generateImage()">🎨 Generate Image</button>
                    <button class="btn btn-secondary" onclick="downloadImage()">💾 Download</button>
                    <button class="btn btn-random" onclick="randomize()">🎲 Randomize All</button>
                    <button class="btn btn-secondary" onclick="resetDefaults()">↺ Reset to Defaults</button>
                </div>
            </div>

            <div class="preview-section">
                <div class="preview-container" id="previewContainer">
                    <p class="loading">Click "Generate Image" to see your design...</p>
                </div>

                <div id="metrics" style="display: none;">
                </div>
            </div>
        </div>
    </div>

    <script>
        const WORKER_URL = window.location.origin;
        let lastGeneratedImage = null;

        // Random backgrounds
        const randomBackgrounds = [
            'https://picsum.photos/800/800',
        ];

        // Color picker sync
        document.getElementById('textColorPicker').addEventListener('change', function() {
            const hex = this.value;
            const rgb = hexToRgb(hex);
            document.getElementById('textColor').value = \`\${rgb.r},\${rgb.g},\${rgb.b},1\`;
        });

        document.getElementById('gradientStartPicker').addEventListener('change', function() {
            const hex = this.value;
            const rgb = hexToRgb(hex);
            document.getElementById('gradientStart').value = \`\${rgb.r},\${rgb.g},\${rgb.b},1\`;
        });

        document.getElementById('gradientEndPicker').addEventListener('change', function() {
            const hex = this.value;
            const rgb = hexToRgb(hex);
            document.getElementById('gradientEnd').value = \`\${rgb.r},\${rgb.g},\${rgb.b},1\`;
        });

        document.getElementById('gradientStyle').addEventListener('change', function() {
            const style = this.value;
            const controls = document.getElementById('gradientControls');

            if (style === 'ens') {
                controls.style.display = 'none';
                document.getElementById('gradientStart').value = '102,126,234,1';
                document.getElementById('gradientEnd').value = '118,75,162,1';
                document.getElementById('gradientStartPicker').value = '#667eea';
                document.getElementById('gradientEndPicker').value = '#764ba2';
            } else if (style === 'custom') {
                controls.style.display = 'grid';
            } else {
                controls.style.display = 'none';
            }
        });

        document.getElementById('layout').addEventListener('change', function() {
            const isV2 = this.value === 'ens-v2';
            document.querySelector('.controls').classList.toggle('v2', isV2);
            document.getElementById('v2Controls').style.display = isV2 ? 'block' : 'none';
        });

        function hexToRgb(hex) {
            const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }

        // Put every control back to the value it has in the page markup, then redraw.
        function resetDefaults() {
            document.querySelectorAll('.controls input, .controls textarea, .controls select').forEach(el => {
                if (el.type === 'checkbox') {
                    el.checked = el.defaultChecked;
                } else if (el.tagName === 'SELECT') {
                    for (const option of el.options) option.selected = option.defaultSelected;
                } else {
                    el.value = el.defaultValue;
                }
            });
            document.getElementById('gradientControls').style.display = '';
            document.getElementById('layout').dispatchEvent(new Event('change'));
            generateImage();
        }

        function setText(text) {
            document.getElementById('text').value = text;
        }

        function setBackground(url) {
            document.getElementById('backgroundImageUrl').value = url;
        }

        function setRandomBackground() {
            const randomUrl = randomBackgrounds[Math.floor(Math.random() * randomBackgrounds.length)];
            setBackground(randomUrl);
        }

        function randomize() {
            const randomEnsNames = [
                '🌟star.eth',
                '🎮gaming.eth',
                '🚀rocket.eth',
                '你好.eth',
                'مرحبا.eth',
                'こんにちは.eth',
                'שלום.eth',
                'नमस्ते.eth',
                'გამარჯობა.eth',
                'γεια.eth',
                'привет.eth',
                '加密货币.eth',
                '🌍world-مرحبا.eth',
                'crypto🏦bank.eth',
                'デジタル💎art.eth',
                'verylongdomainname.eth',
                '123test.eth',
                'nft🎨creator.eth',
                '音乐lover.eth',
                'web3🌐dev.eth',
                'café☕paris.eth',
                '🦄unicorn-magic.eth',
                'αβγ-omega.eth',
                'user2024.eth',
                'blockchain⛓️tech.eth'
            ];
            setText(randomEnsNames[Math.floor(Math.random() * randomEnsNames.length)]);

            document.getElementById('width').value = 518;
            document.getElementById('height').value = 518;

            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
            const bgColors = ['#2C3E50', '#8E44AD', '#E74C3C', '#F39C12', '#27AE60', '#3498DB', '#E67E22'];

            const textColor = colors[Math.floor(Math.random() * colors.length)];
            const bgColor = bgColors[Math.floor(Math.random() * bgColors.length)];

            document.getElementById('textColorPicker').value = textColor;
            document.getElementById('bgColorPicker').value = bgColor;

            const textRgb = hexToRgb(textColor);
            const bgRgb = hexToRgb(bgColor);

            document.getElementById('textColor').value = \`\${textRgb.r},\${textRgb.g},\${textRgb.b},1\`;
            document.getElementById('bgColor').value = \`\${bgRgb.r},\${bgRgb.g},\${bgRgb.b},1\`;

            if (Math.random() > 0.5) {
                setRandomBackground();
            } else {
                document.getElementById('backgroundImageUrl').value = '';
            }
        }

        function parseColor(colorString) {
            const parts = colorString.split(',').map(s => parseFloat(s.trim()));
            return parts.length >= 3 ? parts : [0, 0, 0, 1];
        }

        async function generateImage() {
            const previewContainer = document.getElementById('previewContainer');
            const metricsDiv = document.getElementById('metrics');

            previewContainer.innerHTML = '<p class="loading">Generating image...</p>';
            metricsDiv.style.display = 'none';

            const gradientStyle = document.getElementById('gradientStyle').value;
            const data = {
                text: document.getElementById('text').value,
                width: parseInt(document.getElementById('width').value) || 518,
                height: parseInt(document.getElementById('height').value) || 518,
                backgroundImageUrl: document.getElementById('backgroundImageUrl').value || null,
                textColor: parseColor(document.getElementById('textColor').value),
                gradientStart: parseColor(document.getElementById('gradientStart').value),
                gradientEnd: parseColor(document.getElementById('gradientEnd').value),
                useGradient: gradientStyle !== 'solid',
                maxTextWidth: parseInt(document.getElementById('maxTextWidth').value) || null,
                fontSize: parseInt(document.getElementById('fontSize').value) || null,
                autoFontSize: document.getElementById('autoFontSize').checked,
                ensStyle: true
            };

            if (document.getElementById('layout').value === 'ens-v2') {
                data.layout = 'ens-v2';
                data.colors = {
                    label: document.getElementById('labelColor').value,
                    accent: document.getElementById('accentColor').value,
                    logo: document.getElementById('logoColor').value
                };
                data.backgroundColor = document.getElementById('v2BackgroundColor').value;
                data.backgroundMarkup = document.getElementById('backgroundMarkup').value || null;
            }

            try {
                const response = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    lastGeneratedImage = result.image;

                    previewContainer.innerHTML = \`
                        <img src="\${result.image}" alt="Generated Image" class="preview-image">
                    \`;

                    metricsDiv.innerHTML = \`
                        <div class="metrics">
                            <h4>📊 Image Metrics</h4>
                            <div><strong>Format:</strong> \${result.format.toUpperCase()}</div>
                            <div><strong>Layout:</strong> \${data.layout === 'ens-v2' ? 'ENS v2' : 'ENS style'}</div>
                            <div><strong>Dimensions:</strong> \${data.width} × \${data.height}px</div>
                            <div><strong>Text:</strong> "\${data.text.substring(0, 50)}\${data.text.length > 50 ? '...' : ''}"</div>
                            <div><strong>Auto Font Size:</strong> \${data.autoFontSize ? 'Enabled' : 'Disabled'}</div>
                            \${data.maxTextWidth ? \`<div><strong>Max Text Width:</strong> \${data.maxTextWidth}px</div>\` : ''}
                        </div>
                    \`;
                    metricsDiv.style.display = 'block';
                } else {
                    previewContainer.innerHTML = \`
                        <div class="error">
                            <strong>Error:</strong> \${result.error}
                        </div>
                    \`;
                }
            } catch (error) {
                previewContainer.innerHTML = \`
                    <div class="error">
                        <strong>Network Error:</strong> \${error.message}
                    </div>
                \`;
            }
        }

        function downloadImage() {
            if (!lastGeneratedImage) {
                alert('Please generate an image first!');
                return;
            }

            const link = document.createElement('a');
            link.download = \`canvas-generated-\${Date.now()}.png\`;
            link.href = lastGeneratedImage;
            link.click();
        }

        window.addEventListener('load', function() {
            setTimeout(generateImage, 1000);
        });
    </script>
</body>
</html>`;
