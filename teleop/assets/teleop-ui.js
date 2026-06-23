class TeleopUI extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // State
        this.sliderValue = 1.0;
        this.gripperValue = 0.0; // absolute gripper position in [0, 1]
        this.motionEnabled = false;
        this.localStats = { position: { x: 0, y: 0, z: 0 }, orientation: null, fps: 0 };
        this.referenceOrientation = null;
        this.serverDiagnostics = {};

        this.createComponent();
        this.setupEventListeners();
        this.drawAxes();
    }

    createComponent() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    width: 100%;
                    height: 100%;
                    display: block;
                }

                .container {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100vh;
                    background: #000;
                    color: white;
                    padding: 10px;
                    box-sizing: border-box;
                    overflow-y: auto;
                }
                
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                
                .exit-button {
                    width: 40px;
                    height: 40px;
                    color: #fff;
                    border: none;
                    background: transparent;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .scale-section {
                    text-align: center;
                    margin-bottom: 20px;
                }
                
                .scale-value {
                    font-size: 14px;
                    color: #999;
                }
                
                .scale-slider {
                    width: 100%;
                    max-width: 400px;
                    height: 40px;
                    -webkit-appearance: none;
                    background: #333;
                    border-radius: 20px;
                    outline: none;
                }
                
                .scale-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 36px;
                    height: 36px;
                    background: #fff;
                    border-radius: 50%;
                    cursor: pointer;
                }

                .info-section {
                    flex: 0 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                
                .info-box {
                    background: #2a2a2a;
                    padding: 15px;
                }
                
                .info-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: #fff;
                }
                
                .info-content {
                    font-size: 12px;
                    font-family: monospace;
                    line-height: 1.4;
                    color: #ccc;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                .axes-section {
                    flex: 0 0 auto;
                    background: #121212;
                    border: 1px solid #333;
                    padding: 8px;
                    margin-bottom: 12px;
                }

                .axes-canvas {
                    display: block;
                    width: 100%;
                    max-width: 360px;
                    height: 160px;
                    margin: 0 auto;
                    background: #050505;
                    pointer-events: none;
                }

                .status-chip {
                    padding: 5px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                    background: #f44336;
                    color: #fff;
                }

                .status-chip.connected {
                    background: #4caf50;
                }

                .controls {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    margin-top: 4px;
                }

                .gripper-label {
                    font-size: 16px;
                    font-weight: bold;
                    text-transform: uppercase;
                    color: #fff;
                    text-align: center;
                }

                .gripper-label.active {
                    color: rgb(255, 174, 174);
                }

                .gripper-slider {
                    position: relative;
                    width: 90px;
                    height: 260px;
                    background: #333;
                    border-radius: 45px;
                    touch-action: none;
                    user-select: none;
                    overflow: hidden;
                }

                .gripper-slider.active {
                    background: #4a3030;
                }

                .gripper-fill {
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgb(174, 255, 193);
                    opacity: 0.25;
                }

                .gripper-slider.active .gripper-fill {
                    background: rgb(255, 174, 174);
                    opacity: 0.35;
                }

                .gripper-knob {
                    position: absolute;
                    left: 50%;
                    width: 78px;
                    height: 78px;
                    background: #fff;
                    border-radius: 50%;
                    transform: translateX(-50%);
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 14px;
                    font-weight: bold;
                }

                @media (min-width: 768px) {
                    .info-section {
                        flex-direction: row;
                    }
                    
                    .info-box {
                        flex: 1;
                    }

                    .auxilary-section {
                        display: flex;
                        flex-direction: row;
                        justify-content: center;
                        gap: 20px;
                    }

                    .scale-section {
                        width: 300px;
                    }

                    .reserved-section {
                        width: 200px;
                    }
                }
            </style>
            
            <div class="container">
                <div class="header">
                    <div class="status-chip disconnected" id="statusChip">Connecting...</div>
                    <button class="exit-button" id="exitButton">✕</button>
                </div>

                <div class="axes-section">
                    <canvas class="axes-canvas" id="axesCanvas" width="360" height="160"></canvas>
                </div>

                <div class="info-section">
                    <div class="info-box">
                        <div class="info-title">Local Stats</div>
                        <div class="info-content" id="statsContent">Waiting...</div>
                    </div>
                </div>

                <div class="auxilary-section">
                <div class="scale-section">
                    <input type="range" class="scale-slider" id="scaleSlider"
                        min="0" max="5" step="1" value="3">
                    <div class="scale-value" id="scaleValue">scale 1.0</div>
                </div>
                </div>

                <div class="controls">
                    <div class="gripper-label" id="gripperLabel">Hold to Move</div>
                    <div class="gripper-slider" id="gripperSlider">
                        <div class="gripper-fill" id="gripperFill"></div>
                        <div class="gripper-knob" id="gripperKnob"></div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const exitButton = this.shadowRoot.getElementById('exitButton');
        const scaleSlider = this.shadowRoot.getElementById('scaleSlider');
        const gripperSlider = this.shadowRoot.getElementById('gripperSlider');
        const gripperLabel = this.shadowRoot.getElementById('gripperLabel');

        // Exit button
        exitButton.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('exit'));
        });

        // Scale slider
        scaleSlider.addEventListener('input', (event) => {
            const sliderValues = [0.1, 0.25, 0.5, 1.0, 2.0, 4.0];
            this.sliderValue = sliderValues[event.target.value];
            this.shadowRoot.getElementById('scaleValue').textContent = `scale ${this.sliderValue.toFixed(2)}`;

            this.dispatchEvent(new CustomEvent('scalechange', {
                detail: { scale: this.sliderValue }
            }));
        });

        // Gripper slider doubles as the hold-to-move control: pressing it enables motion and sets
        // the absolute gripper position from the touch's vertical position (top = 1, bottom = 0).
        // The track is fixed; tapping anywhere jumps the gripper to that position.
        const valueFromEvent = (event) => {
            const point = event.touches && event.touches[0] ? event.touches[0] : event;
            const rect = gripperSlider.getBoundingClientRect();
            const ratio = (rect.bottom - point.clientY) / rect.height;
            return Math.max(0, Math.min(1, ratio));
        };

        const updateGripperVisual = () => {
            const knob = this.shadowRoot.getElementById('gripperKnob');
            const fill = this.shadowRoot.getElementById('gripperFill');
            // Inset the knob travel by its own height so it stays fully inside the track.
            knob.style.bottom = `calc(${this.gripperValue} * (100% - 78px))`;
            knob.textContent = `${Math.round(this.gripperValue * 100)}`;
            fill.style.height = `${this.gripperValue * 100}%`;
        };

        const handleGripperStart = (event) => {
            event.preventDefault();
            this.motionEnabled = true;
            gripperSlider.classList.add('active');
            gripperLabel.classList.add('active');
            gripperLabel.textContent = 'Moving...';
            this.referenceOrientation = this.cloneOrientation(this.localStats.orientation);
            this.gripperValue = valueFromEvent(event);
            updateGripperVisual();
            this.drawAxes();

            this.dispatchEvent(new CustomEvent('motionchange', { detail: { enabled: true } }));
        };

        const handleGripperMove = (event) => {
            if (!this.motionEnabled) return;
            event.preventDefault();
            this.gripperValue = valueFromEvent(event);
            updateGripperVisual();
        };

        const handleGripperEnd = () => {
            if (!this.motionEnabled) return;
            this.motionEnabled = false;
            gripperSlider.classList.remove('active');
            gripperLabel.classList.remove('active');
            gripperLabel.textContent = 'Hold to Move';

            this.dispatchEvent(new CustomEvent('motionchange', { detail: { enabled: false } }));
        };

        gripperSlider.addEventListener('mousedown', handleGripperStart);
        gripperSlider.addEventListener('touchstart', handleGripperStart, { passive: false });
        document.addEventListener('mousemove', handleGripperMove);
        document.addEventListener('touchmove', handleGripperMove, { passive: false });
        document.addEventListener('mouseup', handleGripperEnd);
        document.addEventListener('touchend', handleGripperEnd);

        updateGripperVisual();
    }

    // Public methods to update displays
    updateLocalStats(stats) {
        this.localStats = stats;
        if (!this.referenceOrientation && stats.orientation) {
            this.referenceOrientation = this.cloneOrientation(stats.orientation);
        }

        const statsContent = this.shadowRoot.getElementById('statsContent');

        statsContent.textContent = '';
        if (stats.position) {
            const position = stats.position;
            statsContent.textContent += `Position: X: ${position.x.toFixed(3)}, Y: ${position.y.toFixed(3)}, Z: ${position.z.toFixed(3)}
`;
        }

        if (stats.orientation) {
            const orientation = stats.orientation;
            statsContent.textContent += `Orientation: X: ${orientation.x.toFixed(2)}, Y: ${orientation.y.toFixed(2)}, Z: ${orientation.z.toFixed(2)}, W: ${orientation.w.toFixed(2)}
`;
        }

        if (stats.fps) {
            const fps = stats.fps.toFixed(2);
            statsContent.textContent += `FPS: ${fps}
`;
        }

        this.drawAxes();
    }

    updateServerDiagnostics(data) {
        this.serverDiagnostics = data;
        const statusChip = this.shadowRoot.getElementById('statusChip');
        if (!statusChip) return;

        const connection = (typeof data === 'object' && data) ? data.connection : data;
        const isConnected = String(connection).toLowerCase() === 'connected';
        statusChip.textContent = isConnected ? 'Connected' : (connection || 'Disconnected');
        statusChip.className = `status-chip ${isConnected ? 'connected' : 'disconnected'}`;
    }

    cloneOrientation(orientation) {
        if (!orientation) return null;
        const numericOr = (value, fallback) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        };

        return {
            x: numericOr(orientation.x, 0),
            y: numericOr(orientation.y, 0),
            z: numericOr(orientation.z, 0),
            w: numericOr(orientation.w, 1)
        };
    }

    quaternionToMatrix(orientation) {
        const q = this.cloneOrientation(orientation);
        if (!q) return null;

        const norm = Math.hypot(q.x, q.y, q.z, q.w);
        if (norm < 1e-6) return null;

        const x = q.x / norm;
        const y = q.y / norm;
        const z = q.z / norm;
        const w = q.w / norm;

        return [
            [
                1 - 2 * (y * y + z * z),
                2 * (x * y - z * w),
                2 * (x * z + y * w)
            ],
            [
                2 * (x * y + z * w),
                1 - 2 * (x * x + z * z),
                2 * (y * z - x * w)
            ],
            [
                2 * (x * z - y * w),
                2 * (y * z + x * w),
                1 - 2 * (x * x + y * y)
            ]
        ];
    }

    getPhoneAxes(orientation) {
        const matrix = this.quaternionToMatrix(orientation);
        if (!matrix) return null;

        return [
            {
                label: 'X top',
                color: '#ff4d4d',
                vector: { x: matrix[0][0], y: matrix[1][0], z: matrix[2][0] }
            },
            {
                label: 'Y left',
                color: '#67e86f',
                vector: { x: matrix[0][1], y: matrix[1][1], z: matrix[2][1] }
            },
            {
                label: 'Z screen',
                color: '#4da3ff',
                vector: { x: matrix[0][2], y: matrix[1][2], z: matrix[2][2] }
            }
        ];
    }

    projectAxis(vector, centerX, centerY, scale) {
        return {
            x: centerX + (vector.x - 0.45 * vector.z) * scale,
            y: centerY - (vector.y + 0.25 * vector.z) * scale
        };
    }

    drawAxisSet(ctx, orientation, options) {
        const axes = this.getPhoneAxes(orientation);
        if (!axes) return;

        ctx.save();
        ctx.globalAlpha = options.alpha;
        ctx.lineWidth = options.lineWidth;
        ctx.setLineDash(options.dashed ? [7, 5] : []);

        for (const axis of axes) {
            const end = this.projectAxis(axis.vector, options.centerX, options.centerY, options.scale);

            ctx.strokeStyle = axis.color;
            ctx.beginPath();
            ctx.moveTo(options.centerX, options.centerY);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            ctx.fillStyle = axis.color;
            ctx.font = '12px monospace';
            ctx.fillText(axis.label, end.x + 5, end.y - 5);
        }

        ctx.restore();
    }

    drawAxes() {
        const canvas = this.shadowRoot.getElementById('axesCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2 + 8;
        const scale = Math.min(width, height) * 0.36;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#777';
        ctx.font = '12px monospace';
        ctx.fillText('phone raw WebXR axes', 12, 20);

        if (!this.localStats.orientation) {
            ctx.fillText('waiting for pose...', centerX - 58, centerY);
            return;
        }

        if (this.referenceOrientation) {
            this.drawAxisSet(ctx, this.referenceOrientation, {
                centerX,
                centerY,
                scale,
                alpha: 0.35,
                lineWidth: 2,
                dashed: true
            });
        }

        this.drawAxisSet(ctx, this.localStats.orientation, {
            centerX,
            centerY,
            scale,
            alpha: 1,
            lineWidth: 4,
            dashed: false
        });

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Getters
    getScale() {
        return this.sliderValue;
    }

    getGripper() {
        return this.gripperValue;
    }

    isMotionEnabled() {
        return this.motionEnabled;
    }

    // Reserved A/B buttons were removed from the phone UI; kept as stubs so the shared
    // pose-message builder works unchanged.
    isReservedButtonAActive() {
        return false;
    }

    isReservedButtonBActive() {
        return false;
    }
}

// Register the custom element
customElements.define('teleop-ui', TeleopUI);
