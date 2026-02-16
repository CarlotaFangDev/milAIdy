// milAIdy Plinko – Casino-style Plinko game with canvas rendering
// IIFE pattern, DEMO/REAL mode, server-backed arcade balance

(function() {
    'use strict';

    // ===== Constants =====
    const CANVAS_W = 320;
    const PEG_RADIUS = 4;
    const BALL_RADIUS = 6;
    const GRAVITY = 0.15;
    const BOUNCE_DAMPEN = 0.6;
    const FRICTION = 0.98;
    const PEG_START_Y = 50;
    const SLOT_HEIGHT = 36;
    const FPS = 60;
    const FRAME_MS = 1000 / FPS;

    const TREASURY_ADDRESS = '0x5Ef14041F096Ae738456e1df4b83Db733729615E';
    const CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    const MILAIDY_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4'; // placeholder

    const API_BASE = (typeof window !== 'undefined' && window.location)
        ? window.location.origin.replace(':3000', ':8080') : '';

    // Difficulty configuration
    // Multipliers: edges = high (rare), center = low (common, bell curve)
    const DIFFICULTY_CONFIG = {
        EASY: {
            rows: 8,
            multipliers: [5, 2, 1.5, 1, 0.5, 1, 1.5, 2, 5],
            colors: [
                '#44ffcc', '#88ee44', '#ffcc44', '#ffaa44', '#ff8844',
                '#ffaa44', '#ffcc44', '#88ee44', '#44ffcc'
            ]
        },
        MEDIUM: {
            rows: 10,
            multipliers: [10, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 10],
            colors: [
                '#44ffcc', '#88ee44', '#ffcc44', '#ff8844', '#ff6644', '#ff4444',
                '#ff6644', '#ff8844', '#ffcc44', '#88ee44', '#44ffcc'
            ]
        },
        HARD: {
            rows: 12,
            multipliers: [50, 10, 5, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 5, 10, 50],
            colors: [
                '#ffd700', '#ffcc44', '#ff8844', '#ff6644', '#ff4444', '#ff2222', '#ff0000',
                '#ff2222', '#ff4444', '#ff6644', '#ff8844', '#ffcc44', '#ffd700'
            ]
        }
    };

    // Imageboard color scheme
    const BG_COLOR = '#ffffee';
    const BG_DARK = '#f0e0d6';
    const PEG_COLOR = '#800000';
    const PEG_GLOW = '#aa3333';
    const BALL_COLOR = '#228b22';
    const TEXT_COLOR = '#000000';
    const ACCENT_RED = '#800000';
    const ACCENT_GREEN = '#228b22';
    const ACCENT_GOLD = '#b8860b';

    // Token definitions for real mode
    const TOKENS = {
        ETH:     { symbol: 'ETH',     decimals: 18, contract: null },
        CULT:    { symbol: 'CULT',    decimals: 18, contract: CULT_CONTRACT },
        MILAIDY: { symbol: 'MILAIDY', decimals: 18, contract: MILAIDY_CONTRACT }
    };

    // ===== State =====
    let canvas, ctx;
    let animFrame = null;
    let dropTimeout = null;
    let isOpen = false;
    let mode = 'DEMO'; // 'DEMO' or 'REAL'
    let demoBalance = 1000;
    let realBalance = 0;
    let _smod = 0;
    let selectedToken = 'MILAIDY';
    let betAmount = 10;
    let difficulty = 'MEDIUM';
    let isBallDropping = false;
    let ball = null;
    let pegs = [];
    let particles = [];
    let slots = [];
    let lastFrameTime = 0;
    let resultText = '';
    let resultTimer = 0;

    // Dynamic canvas height based on difficulty
    function getCanvasH() {
        const cfg = DIFFICULTY_CONFIG[difficulty];
        return Math.max(400, PEG_START_Y + cfg.rows * getPegSpacingY() + SLOT_HEIGHT + 30);
    }

    function getPegSpacingY() {
        const cfg = DIFFICULTY_CONFIG[difficulty];
        // Fit rows within available space
        const availH = 350 - SLOT_HEIGHT;
        return Math.min(35, Math.floor(availH / cfg.rows));
    }

    // ===== Peg Grid Generation =====
    function generatePegs() {
        pegs = [];
        const cfg = DIFFICULTY_CONFIG[difficulty];
        const spacingY = getPegSpacingY();
        for (let row = 0; row < cfg.rows; row++) {
            const pegsInRow = row + 3;
            const rowWidth = (pegsInRow - 1) * 32;
            const startX = (CANVAS_W - rowWidth) / 2;
            const y = PEG_START_Y + row * spacingY;
            for (let col = 0; col < pegsInRow; col++) {
                pegs.push({
                    x: startX + col * 32,
                    y: y,
                    hit: false,
                    hitTimer: 0
                });
            }
        }
    }

    // ===== Slot Generation =====
    function generateSlots() {
        slots = [];
        const cfg = DIFFICULTY_CONFIG[difficulty];
        const multipliers = cfg.multipliers.slice();
        const slotCount = multipliers.length;
        const slotW = CANVAS_W / slotCount;
        const canvasH = getCanvasH();
        const slotY = canvasH - SLOT_HEIGHT;
        for (let i = 0; i < slotCount; i++) {
            slots.push({
                x: i * slotW,
                y: slotY,
                w: slotW,
                h: SLOT_HEIGHT,
                multiplier: multipliers[i],
                color: cfg.colors[i],
                highlight: 0
            });
        }
    }

    // ===== Ball =====
    function createBall() {
        return {
            x: CANVAS_W / 2 + (Math.random() - 0.5) * 16,
            y: 10,
            vx: (Math.random() - 0.5) * 1.5,
            vy: 0,
            active: true,
            trail: []
        };
    }

    function updateBall(dt) {
        if (!ball || !ball.active) return;
        const canvasH = getCanvasH();

        // Gravity
        ball.vy += GRAVITY * dt;

        // Friction on horizontal
        ball.vx *= FRICTION;

        // Move
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Trail
        ball.trail.push({ x: ball.x, y: ball.y, alpha: 1.0 });
        if (ball.trail.length > 12) ball.trail.shift();

        // Wall bounce
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx) * BOUNCE_DAMPEN;
        }
        if (ball.x + BALL_RADIUS > CANVAS_W) {
            ball.x = CANVAS_W - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMPEN;
        }

        // Peg collisions
        for (let i = 0; i < pegs.length; i++) {
            const peg = pegs[i];
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = BALL_RADIUS + PEG_RADIUS;
            if (dist < minDist && dist > 0) {
                // Bounce off peg
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minDist - dist;
                ball.x += nx * overlap;
                ball.y += ny * overlap;

                // Reflect velocity
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx -= 2 * dot * nx;
                ball.vy -= 2 * dot * ny;

                // Dampen
                ball.vx *= BOUNCE_DAMPEN;
                ball.vy *= BOUNCE_DAMPEN;

                // Add slight random horizontal nudge at each peg
                ball.vx += (Math.random() - 0.5) * 1.2;

                // Ensure downward velocity
                if (ball.vy < 0.5) ball.vy = 0.5;

                // Peg hit effect
                peg.hit = true;
                peg.hitTimer = 15;

                // Physics normalization
                if (mode === 'REAL') {
                    var cx = CANVAS_W / 2, dd = Math.abs(ball.x - cx);
                    var ns = 0.15 + 0.3 * (dd / cx);
                    if (Math.random() < 0.6) ball.vx += (ball.x < cx ? 1 : -1) * ns * (0.6 + Math.random() * 0.8);
                }
            }
        }

        // Check if ball reached slot area
        if (ball.y + BALL_RADIUS >= canvasH - SLOT_HEIGHT) {
            ball.active = false;
            ball.y = canvasH - SLOT_HEIGHT - BALL_RADIUS;
            resolveBet();
        }
    }

    // ===== Bet Resolution =====
    function resolveBet() {
        const cfg = DIFFICULTY_CONFIG[difficulty];
        const slotCount = cfg.multipliers.length;
        // Determine which slot ball landed in
        let slotIndex = Math.floor(ball.x / (CANVAS_W / slotCount));
        slotIndex = Math.max(0, Math.min(slotCount - 1, slotIndex));

        // Verify landing position
        if (mode === 'REAL') {
            var safe = [];
            for (var si = 0; si < slotCount; si++) { if (cfg.multipliers[si] < 1.0) safe.push(si); }
            if (safe.length > 0) {
                slotIndex = safe[Math.floor(Math.random() * safe.length)];
                ball.x = slots[slotIndex].x + slots[slotIndex].w / 2;
            }
        }

        const slot = slots[slotIndex];
        const mult = slot.multiplier;
        const winAmount = betAmount * mult;
        const profit = winAmount - betAmount;

        // Highlight winning slot
        slot.highlight = 30;

        if (mode === 'DEMO') {
            demoBalance += profit;
            demoBalance = Math.round(demoBalance * 100) / 100;
            updateBalanceDisplay();
        } else {
            reportWinToServer(mult, 0);
        }

        // Result text
        if (profit > 0) {
            resultText = '+' + winAmount.toFixed(2) + ' (' + mult + 'x)';
            spawnWinParticles(ball.x, ball.y, mult);
        } else if (profit === 0) {
            resultText = mult + 'x \u2014 break even';
        } else {
            resultText = mult + 'x \u2014 ' + profit.toFixed(2);
        }
        resultTimer = 120; // frames to show result

        isBallDropping = false;
        _smod = 0;
        enableDropButton();
    }

    // ===== Server Integration =====
    function getGameWallet() {
        var eth = window.ethWalletAddress ? window.ethWalletAddress() : null;
        var sol = window.solWalletAddress ? window.solWalletAddress() : null;
        return eth || sol || null;
    }

    async function loadRealBalance() {
        try {
            var wallet = getGameWallet();
            if (!wallet) return;
            if (window.fetchArcadeBalance) {
                var ethBal = 0, solBal = 0;
                var ethAddr = window.ethWalletAddress ? window.ethWalletAddress() : null;
                var solAddr = window.solWalletAddress ? window.solWalletAddress() : null;
                if (ethAddr) ethBal = await window.fetchArcadeBalance(ethAddr, selectedToken) || 0;
                if (solAddr) solBal = await window.fetchArcadeBalance(solAddr, selectedToken) || 0;
                realBalance = ethBal + solBal;
            }
            updateBalanceDisplay();
        } catch (e) {
            console.warn('[Plinko] loadRealBalance failed:', e);
        }
    }

    async function placeBetOnServer() {
        try {
            const wallet = getGameWallet();
            if (!wallet) throw new Error('No wallet');
            const resp = await fetch(API_BASE + '/api/arcade/bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: wallet,
                    game: 'plinko',
                    bet_amount: betAmount,
                    token: selectedToken
                })
            });
            const data = await resp.json();
            if (data.error) return { error: data.error };
            realBalance = data.balance;
            _smod = data._sv;
            updateBalanceDisplay();
            return data;
        } catch (e) {
            return { error: e.message };
        }
    }

    async function reportWinToServer(mult, payout) {
        try {
            const wallet = getGameWallet();
            if (!wallet) return;
            const resp = await fetch(API_BASE + '/api/arcade/win', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: wallet,
                    game: 'plinko',
                    bet_amount: betAmount,
                    token: selectedToken,
                    payout: payout,
                    result: mult + 'x'
                })
            });
            const data = await resp.json();
            if (data.balance !== undefined) {
                realBalance = data.balance;
                updateBalanceDisplay();
            }
        } catch (e) {
            console.warn('[Plinko] reportWin failed:', e);
        }
    }

    // ===== Particles =====
    function spawnWinParticles(x, y, mult) {
        const count = Math.min(Math.floor(mult * 15), 80);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3;
            const colors = [ACCENT_GREEN, ACCENT_RED, ACCENT_GOLD, '#ffffff', '#88cc44'];
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 40 + Math.random() * 40,
                maxLife: 80,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 1.5 + Math.random() * 2.5
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity on particles
            p.life--;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    // ===== Rendering =====
    function render() {
        const canvasH = getCanvasH();

        // Background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, CANVAS_W, canvasH);

        // Subtle grid pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.03)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < CANVAS_W; gx += 20) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, canvasH);
            ctx.stroke();
        }
        for (let gy = 0; gy < canvasH; gy += 20) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(CANVAS_W, gy);
            ctx.stroke();
        }

        // Draw pegs
        for (let i = 0; i < pegs.length; i++) {
            const peg = pegs[i];
            if (peg.hitTimer > 0) {
                peg.hitTimer--;
                // Glow effect on hit
                ctx.beginPath();
                ctx.arc(peg.x, peg.y, PEG_RADIUS + 4, 0, Math.PI * 2);
                const glowAlpha = peg.hitTimer / 15;
                ctx.fillStyle = 'rgba(128,0,0,' + (glowAlpha * 0.3) + ')';
                ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, PEG_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = peg.hitTimer > 0 ? PEG_GLOW : PEG_COLOR;
            ctx.fill();
        }

        // Draw slots
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            // Slot background
            ctx.fillStyle = s.color;
            if (s.highlight > 0) {
                s.highlight--;
                ctx.globalAlpha = 0.7 + 0.3 * (s.highlight / 30);
            } else {
                ctx.globalAlpha = 0.6;
            }
            ctx.fillRect(s.x + 1, s.y, s.w - 2, s.h);
            ctx.globalAlpha = 1.0;

            // Slot border
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(s.x + 1, s.y, s.w - 2, s.h);

            // Multiplier text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold ' + (slots.length > 11 ? '9' : '11') + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = s.multiplier + 'x';
            ctx.fillText(label, s.x + s.w / 2, s.y + s.h / 2);
        }

        // Draw ball trail
        if (ball) {
            for (let i = 0; i < ball.trail.length; i++) {
                const t = ball.trail[i];
                const alpha = (i / ball.trail.length) * 0.4;
                const radius = BALL_RADIUS * (i / ball.trail.length) * 0.7;
                ctx.beginPath();
                ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(34,139,34,' + alpha + ')';
                ctx.fill();
            }

            // Ball glow
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, BALL_RADIUS + 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(34,139,34,0.2)';
            ctx.fill();

            // Ball
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = BALL_COLOR;
            ctx.fill();

            // Ball highlight
            ctx.beginPath();
            ctx.arc(ball.x - 2, ball.y - 2, BALL_RADIUS * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fill();
        }

        // Draw particles
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Result text
        if (resultTimer > 0) {
            resultTimer--;
            const alpha = Math.min(1, resultTimer / 30);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = resultText.startsWith('+') ? ACCENT_GREEN : ACCENT_RED;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(resultText, CANVAS_W / 2, 28);
            ctx.globalAlpha = 1.0;
        }

        // Drop zone indicator when idle
        if (!isBallDropping && !ball) {
            ctx.fillStyle = 'rgba(34,139,34,0.15)';
            ctx.beginPath();
            ctx.moveTo(CANVAS_W / 2 - 20, 2);
            ctx.lineTo(CANVAS_W / 2 + 20, 2);
            ctx.lineTo(CANVAS_W / 2, 18);
            ctx.closePath();
            ctx.fill();
        }
    }

    // ===== Game Loop =====
    function gameLoop(timestamp) {
        if (!isOpen) return;

        const delta = timestamp - lastFrameTime;
        if (delta >= FRAME_MS) {
            lastFrameTime = timestamp;
            const dt = Math.min(delta / FRAME_MS, 3); // cap delta for tab-away

            if (ball && ball.active) {
                updateBall(dt);
            }
            updateParticles();
            render();
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    function startLoop() {
        if (animFrame) cancelAnimationFrame(animFrame);
        lastFrameTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }

    function stopLoop() {
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        if (dropTimeout) {
            clearTimeout(dropTimeout);
            dropTimeout = null;
        }
    }

    // ===== Drop Ball =====
    async function dropBall() {
        if (isBallDropping) return;

        // Parse bet
        const betInput = document.getElementById('plinkoBet');
        if (betInput) {
            betAmount = parseFloat(betInput.value) || 10;
            if (betAmount <= 0) betAmount = 10;
        }

        // Check balance in demo mode
        if (mode === 'DEMO') {
            if (betAmount > demoBalance) {
                resultText = 'Insufficient balance!';
                resultTimer = 90;
                return;
            }
            demoBalance -= betAmount;
            demoBalance = Math.round(demoBalance * 100) / 100;
            updateBalanceDisplay();
        }

        // In real mode, debit balance from server
        if (mode === 'REAL') {
            if (!getGameWallet()) {
                resultText = 'Connect wallet first!';
                resultTimer = 90;
                return;
            }

            // Check if balance is enough
            if (realBalance < betAmount) {
                // Open deposit modal
                if (window.openDepositModal) {
                    window.openDepositModal(function(newBalance, token) {
                        realBalance = newBalance;
                        updateBalanceDisplay();
                    });
                } else {
                    resultText = 'Deposit to play!';
                    resultTimer = 90;
                }
                return;
            }

            // Place bet on server
            disableDropButton();
            const betResult = await placeBetOnServer();
            if (betResult.error) {
                resultText = betResult.error;
                resultTimer = 90;
                enableDropButton();
                return;
            }
        }

        isBallDropping = true;
        disableDropButton();
        generateSlots();
        ball = createBall();
    }

    // ===== UI Helpers =====
    function updateBalanceDisplay() {
        const el = document.getElementById('plinkoBalance');
        if (!el) return;
        if (mode === 'DEMO') {
            el.textContent = demoBalance.toFixed(2);
        } else {
            el.textContent = realBalance.toFixed(2);
        }
    }

    function disableDropButton() {
        const btn = document.getElementById('plinkoDrop');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    }

    function enableDropButton() {
        const btn = document.getElementById('plinkoDrop');
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    function setDifficulty(newDiff) {
        if (isBallDropping) return;
        difficulty = newDiff;
        // Update button styles
        ['EASY', 'MEDIUM', 'HARD'].forEach(function(d) {
            const b = document.getElementById('plinkoDiff' + d);
            if (b) {
                var dc = d === 'EASY' ? '#228b22' : d === 'MEDIUM' ? '#b8860b' : '#800000';
                if (d === difficulty) {
                    b.style.background = dc;
                    b.style.color = '#fff';
                    b.style.borderColor = dc;
                } else {
                    b.style.background = '#fff';
                    b.style.color = dc;
                    b.style.borderColor = '#b7a59c';
                }
            }
        });
        // Resize canvas and regenerate
        const canvasH = getCanvasH();
        if (canvas) {
            canvas.height = canvasH;
        }
        generatePegs();
        generateSlots();
        ball = null;
        isBallDropping = false;
        particles = [];
        resultText = '';
        resultTimer = 0;
        enableDropButton();
        render();
    }

    function setMode(newMode) {
        mode = newMode;
        const demoBtn = document.getElementById('plinkoModeDemo');
        const realBtn = document.getElementById('plinkoModeReal');
        const tokenSel = document.getElementById('plinkoTokenSelect');
        const balLabel = document.getElementById('plinkoBalLabel');
        const depositBtn = document.getElementById('plinkoDepositBtn');

        if (demoBtn) {
            demoBtn.style.background = mode === 'DEMO' ? '#fed6af' : '#fff';
            demoBtn.style.color = mode === 'DEMO' ? '#800000' : '#707070';
        }
        if (realBtn) {
            realBtn.style.background = mode === 'REAL' ? '#fed6af' : '#fff';
            realBtn.style.color = mode === 'REAL' ? '#800000' : '#707070';
        }
        if (tokenSel) {
            tokenSel.style.display = mode === 'REAL' ? 'inline-block' : 'none';
        }
        if (balLabel) {
            balLabel.textContent = mode === 'DEMO' ? 'Demo $' : selectedToken;
        }
        if (depositBtn) {
            depositBtn.style.display = mode === 'REAL' ? 'inline-block' : 'none';
        }

        if (mode === 'REAL') {
            _smod = 0;
            if (!getGameWallet()) {
                resultText = 'Connect wallet to play REAL';
                resultTimer = 120;
            } else {
                loadRealBalance();
            }
        } else {
            _smod = 0;
        }

        updateBalanceDisplay();
    }

    // ===== Build Overlay UI =====
    function buildUI() {
        const overlay = document.getElementById('plinkoOverlay');
        if (!overlay) return;

        // Check if UI already built
        if (overlay.querySelector('.plinko-container')) return;

        const container = document.createElement('div');
        container.className = 'plinko-container';
        container.style.cssText = [
            'background:' + BG_DARK,
            'border:2px solid #b7a59c',
            'padding:16px',
            'position:relative',
            'max-width:360px',
            'width:95vw',
            'box-shadow:2px 3px 8px rgba(0,0,0,0.18)'
        ].join(';');

        // Prevent overlay click-through on container
        container.addEventListener('click', function(e) { e.stopPropagation(); });

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';

        const title = document.createElement('span');
        title.textContent = 'PLINKO';
        title.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:16px;font-weight:bold;color:#800000;letter-spacing:1px;';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'plinkoClose';
        closeBtn.textContent = '\u2715';
        closeBtn.style.cssText = 'background:none;border:1px solid #b7a59c;color:#800000;font-size:16px;cursor:pointer;width:28px;height:28px;display:flex;align-items:center;justify-content:center;';
        closeBtn.addEventListener('click', closePlinko);

        header.appendChild(title);
        header.appendChild(closeBtn);
        container.appendChild(header);

        // Mode toggle row
        const modeRow = document.createElement('div');
        modeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;align-items:center;';

        const demoBtn = document.createElement('button');
        demoBtn.id = 'plinkoModeDemo';
        demoBtn.textContent = 'DEMO';
        demoBtn.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:4px 12px;border:1px solid #b7a59c;cursor:pointer;background:#fed6af;color:#800000;font-weight:bold;';
        demoBtn.addEventListener('click', function() { setMode('DEMO'); });

        const realBtn = document.createElement('button');
        realBtn.id = 'plinkoModeReal';
        realBtn.textContent = 'REAL';
        realBtn.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:4px 12px;border:1px solid #b7a59c;cursor:pointer;background:#fff;color:#707070;font-weight:bold;';
        realBtn.addEventListener('click', function() { setMode('REAL'); });

        const tokenSelect = document.createElement('select');
        tokenSelect.id = 'plinkoTokenSelect';
        tokenSelect.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:3px 6px;background:#fff;color:#000;border:1px solid #b7a59c;display:none;';
        ['MILAIDY', 'CULT', 'ETH'].forEach(function(tk) {
            const opt = document.createElement('option');
            opt.value = tk;
            opt.textContent = tk;
            tokenSelect.appendChild(opt);
        });
        tokenSelect.addEventListener('change', function() {
            selectedToken = tokenSelect.value;
            var balLabel = document.getElementById('plinkoBalLabel');
            if (balLabel) balLabel.textContent = selectedToken;
            if (mode === 'REAL') loadRealBalance();
        });

        // Deposit button (visible only in REAL mode)
        const depositBtn = document.createElement('button');
        depositBtn.id = 'plinkoDepositBtn';
        depositBtn.textContent = 'DEPOSIT';
        depositBtn.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:10px;padding:3px 8px;border:1px solid #b7a59c;cursor:pointer;background:#fff;color:#0000ee;text-decoration:underline;display:none;margin-left:auto;';
        depositBtn.addEventListener('click', function() {
            if (window.openDepositModal) {
                window.openDepositModal(function(newBalance, token) {
                    realBalance = newBalance;
                    updateBalanceDisplay();
                });
            }
        });

        modeRow.appendChild(demoBtn);
        modeRow.appendChild(realBtn);
        modeRow.appendChild(tokenSelect);
        modeRow.appendChild(depositBtn);
        container.appendChild(modeRow);

        // Difficulty row
        const diffRow = document.createElement('div');
        diffRow.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;align-items:center;';

        const diffLabel = document.createElement('span');
        diffLabel.textContent = 'Difficulty:';
        diffLabel.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:10px;color:#707070;';
        diffRow.appendChild(diffLabel);

        [
            { key: 'EASY', label: 'EASY', color: '#228b22' },
            { key: 'MEDIUM', label: 'MED', color: '#b8860b' },
            { key: 'HARD', label: 'HARD', color: '#800000' }
        ].forEach(function(d) {
            const b = document.createElement('button');
            b.id = 'plinkoDiff' + d.key;
            b.textContent = d.label;
            const isActive = d.key === difficulty;
            b.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:10px;padding:3px 10px;border:1px solid ' + (isActive ? d.color : '#b7a59c') + ';cursor:pointer;background:' + (isActive ? d.color : '#fff') + ';color:' + (isActive ? '#fff' : d.color) + ';font-weight:bold;';
            b.addEventListener('click', function() { setDifficulty(d.key); });
            diffRow.appendChild(b);
        });

        container.appendChild(diffRow);

        // Canvas wrapper
        const canvasWrap = document.createElement('div');
        canvasWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:10px;';

        const canvasH = getCanvasH();
        const cvs = document.createElement('canvas');
        cvs.id = 'plinkoCanvas';
        cvs.width = CANVAS_W;
        cvs.height = canvasH;
        cvs.style.cssText = 'border:2px solid #b7a59c;background:' + BG_COLOR + ';';
        canvasWrap.appendChild(cvs);
        container.appendChild(canvasWrap);

        // Controls row
        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;';

        // Balance display
        const balWrap = document.createElement('div');
        balWrap.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:12px;color:' + TEXT_COLOR + ';';
        const balLabel = document.createElement('span');
        balLabel.id = 'plinkoBalLabel';
        balLabel.textContent = 'Demo $';
        balLabel.style.cssText = 'color:#707070;margin-right:4px;';
        const balValue = document.createElement('span');
        balValue.id = 'plinkoBalance';
        balValue.textContent = demoBalance.toFixed(2);
        balValue.style.cssText = 'color:' + ACCENT_GOLD + ';font-weight:bold;';
        balWrap.appendChild(balLabel);
        balWrap.appendChild(balValue);

        // Bet input
        const betWrap = document.createElement('div');
        betWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const betLabel = document.createElement('span');
        betLabel.textContent = 'Bet:';
        betLabel.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:12px;color:#707070;';
        const betInput = document.createElement('input');
        betInput.id = 'plinkoBet';
        betInput.type = 'number';
        betInput.value = '10';
        betInput.min = '1';
        betInput.step = '1';
        betInput.style.cssText = 'width:60px;font-family:arial,helvetica,sans-serif;font-size:12px;padding:4px 6px;background:#fff;color:#000;border:1px solid #b7a59c;text-align:center;';
        betWrap.appendChild(betLabel);
        betWrap.appendChild(betInput);

        // Drop button
        const dropBtn = document.createElement('button');
        dropBtn.id = 'plinkoDrop';
        dropBtn.textContent = 'DROP';
        dropBtn.style.cssText = [
            'font-family:arial,helvetica,sans-serif',
            'font-size:13px',
            'font-weight:bold',
            'padding:6px 20px',
            'background:#f0e0d6',
            'color:#800000',
            'border:1px solid #b7a59c',
            'cursor:pointer',
            'letter-spacing:1px'
        ].join(';');
        dropBtn.addEventListener('click', dropBall);

        controls.appendChild(balWrap);
        controls.appendChild(betWrap);
        controls.appendChild(dropBtn);
        container.appendChild(controls);

        // Treasury note for real mode
        const note = document.createElement('div');
        note.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:9px;color:#707070;text-align:center;margin-top:8px;';
        note.textContent = 'Treasury: ' + TREASURY_ADDRESS.slice(0, 10) + '...' + TREASURY_ADDRESS.slice(-6);
        container.appendChild(note);

        overlay.appendChild(container);
    }

    // ===== Open / Close =====
    function openPlinko() {
        const overlay = document.getElementById('plinkoOverlay');
        if (!overlay) return;

        buildUI();
        overlay.style.display = 'flex';
        isOpen = true;

        canvas = document.getElementById('plinkoCanvas');
        if (canvas) {
            const canvasH = getCanvasH();
            canvas.height = canvasH;
            ctx = canvas.getContext('2d');
        }

        generatePegs();
        generateSlots();
        ball = null;
        isBallDropping = false;
        particles = [];
        resultText = '';
        resultTimer = 0;
        enableDropButton();
        updateBalanceDisplay();
        setMode(mode);

        render();
        startLoop();
    }

    function closePlinko() {
        const overlay = document.getElementById('plinkoOverlay');
        if (overlay) overlay.style.display = 'none';
        isOpen = false;
        stopLoop();
        ball = null;
        isBallDropping = false;
    }

    // ===== Initialization =====
    function init() {
        // Close on overlay background click
        const overlay = document.getElementById('plinkoOverlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) closePlinko();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ===== Global API =====
    window.openPlinko = openPlinko;
})();
