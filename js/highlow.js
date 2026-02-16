// milAIdy – Higher or Lower Card Casino Game
// Hybrid: canvas for cards, DOM for controls
(function() {
    'use strict';
    var W = 300, H = 270;
    var API_BASE = (typeof window !== 'undefined' && window.location)
        ? window.location.origin.replace(':3000', ':8080') : '';
    var MULTS = [1, 1.5, 2, 3, 5, 8, 13, 21, 34];
    var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
    var VALS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    var SYM = { hearts:'\u2665', diamonds:'\u2666', clubs:'\u2663', spades:'\u2660' };
    var SCOL = { hearts:'#cc2222', diamonds:'#cc2222', clubs:'#111', spades:'#111' };
    var canvas, ctx, state = null;
    var controlsEl = null;
    var DEF = { mode:'demo', demoBalance:1000, realBalance:0, _smod:0, token:'MILAIDY', bet:10, currentCard:null,
        nextCard:null, deck:[], streak:0, phase:'idle', message:'', messageColor:'#800000',
        winnings:0, flipProgress:0 };

    function buildDeck() {
        var d = [];
        for (var s = 0; s < 4; s++) for (var v = 0; v < 13; v++)
            d.push({ suit: SUITS[s], value: VALS[v], num: v + 1 });
        return shuffle(d);
    }
    function shuffle(a) {
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
        return a;
    }
    function draw1() { if (!state.deck.length) state.deck = buildDeck(); return state.deck.pop(); }
    function getMult(s) { return s < MULTS.length ? MULTS[s] : MULTS[8] + (s - 8) * 13; }

    // ===== Canvas: only cards and game display =====
    function drawBg() {
        ctx.fillStyle = '#ffffee'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0a5c36';
        var p=12, rx=p, ry=26, rw=W-p*2, rh=210, cr=10;
        ctx.beginPath(); ctx.moveTo(rx+cr,ry); ctx.lineTo(rx+rw-cr,ry);
        ctx.quadraticCurveTo(rx+rw,ry,rx+rw,ry+cr); ctx.lineTo(rx+rw,ry+rh-cr);
        ctx.quadraticCurveTo(rx+rw,ry+rh,rx+rw-cr,ry+rh); ctx.lineTo(rx+cr,ry+rh);
        ctx.quadraticCurveTo(rx,ry+rh,rx,ry+rh-cr); ctx.lineTo(rx,ry+cr);
        ctx.quadraticCurveTo(rx,ry,rx+cr,ry); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
        for (var i = ry+5; i < ry+rh; i+=6) { ctx.beginPath(); ctx.moveTo(rx+2,i); ctx.lineTo(rx+rw-2,i); ctx.stroke(); }
        ctx.fillStyle = '#800000'; ctx.font = 'bold 11px arial,helvetica,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('HIGHER or LOWER', W/2, 18);
    }

    function drawCard(x, y, w, h, card, face) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x+3, y+3, w, h);
        if (!face) {
            ctx.fillStyle = '#fff'; ctx.fillRect(x,y,w,h);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.strokeRect(x,y,w,h);
            ctx.fillStyle = '#6b1530'; ctx.fillRect(x+4,y+4,w-8,h-8);
            ctx.fillStyle = '#8b2040';
            for (var py=y+6; py<y+h-6; py+=4) for (var px=x+6; px<x+w-6; px+=4)
                if ((Math.floor((px-x)/4)+Math.floor((py-y)/4))%2===0) ctx.fillRect(px,py,3,3);
            ctx.fillStyle = '#d4af37'; var cx=x+w/2, cy=y+h/2;
            ctx.beginPath(); ctx.moveTo(cx,cy-10); ctx.lineTo(cx+7,cy);
            ctx.lineTo(cx,cy+10); ctx.lineTo(cx-7,cy); ctx.closePath(); ctx.fill();
            return;
        }
        ctx.fillStyle = '#fff'; ctx.fillRect(x,y,w,h);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.strokeRect(x,y,w,h);
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.strokeRect(x+3,y+3,w-6,h-6);
        var col = SCOL[card.suit], sym = SYM[card.suit];
        ctx.fillStyle = col; ctx.font = 'bold 16px arial,helvetica,sans-serif';
        ctx.textAlign = 'left'; ctx.fillText(card.value, x+6, y+20);
        ctx.font = '14px arial,helvetica,sans-serif'; ctx.fillText(sym, x+6, y+36);
        ctx.save(); ctx.translate(x+w-6, y+h-6); ctx.rotate(Math.PI);
        ctx.font = 'bold 16px arial,helvetica,sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(card.value, 0, 14); ctx.font = '14px arial,helvetica,sans-serif';
        ctx.fillText(sym, 0, 28); ctx.restore();
        ctx.fillStyle = col; ctx.font = '36px arial,helvetica,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(sym, x+w/2, y+h/2+12);
    }

    function drawGame() {
        var cw=80, ch=120, lx=30, rx=W-30-cw, cy=60;
        ctx.fillStyle = '#c0c0a0'; ctx.font = '9px arial,helvetica,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('CURRENT', lx+cw/2, cy-6); ctx.fillText('NEXT', rx+cw/2, cy-6);
        ctx.fillStyle = '#d4af37'; ctx.font = 'bold 18px arial,helvetica,sans-serif';
        ctx.fillText('\u25B6', W/2, cy+ch/2+6);
        if (state.currentCard) drawCard(lx,cy,cw,ch,state.currentCard,true);
        else drawCard(lx,cy,cw,ch,null,false);
        var showing = state.phase==='reveal'||state.phase==='gameover'||state.phase==='cashout';
        if (showing && state.nextCard) {
            if (state.flipProgress < 1) {
                var sc = Math.abs(Math.cos(state.flipProgress*Math.PI)), fw = Math.max(1,cw*sc);
                drawCard(rx+(cw-fw)/2, cy, fw, ch, state.nextCard, state.flipProgress>=0.5);
            } else drawCard(rx,cy,cw,ch,state.nextCard,true);
        } else drawCard(rx,cy,cw,ch,null,false);
        if (state.phase==='playing'||state.phase==='reveal') {
            var m = getMult(state.streak);
            ctx.fillStyle = '#d4af37'; ctx.font = 'bold 11px arial,helvetica,sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('STREAK: '+state.streak+'  x'+m.toFixed(1), W/2, 200);
            if (state.streak > 0) {
                ctx.fillStyle = '#228b22'; ctx.font = '10px arial,helvetica,sans-serif';
                ctx.fillText('Potential win: '+(state.bet*m).toFixed(2), W/2, 216);
            }
        }
    }

    function render() {
        if (!canvas||!ctx) return;
        drawBg(); drawGame();
        updateControls();
    }

    // ===== DOM Controls =====
    function updateControls() {
        if (!controlsEl) return;
        var balEl = controlsEl.querySelector('#hlBal');
        if (balEl) {
            if (state.mode==='demo') balEl.textContent = state.demoBalance.toFixed(2) + ' DEMO';
            else balEl.textContent = state.realBalance.toFixed(2) + ' ' + state.token;
        }
        var betEl = controlsEl.querySelector('#hlBetInput');
        if (betEl && document.activeElement !== betEl) betEl.value = state.bet;
        var msgEl = document.getElementById('hlMsg');
        if (msgEl) { msgEl.textContent = state.message || ''; msgEl.style.color = state.messageColor || '#800000'; msgEl.style.display = state.message ? 'block' : 'none'; }
        // Show/hide button groups
        var idleG = controlsEl.querySelector('#hlIdleGroup');
        var playG = controlsEl.querySelector('#hlPlayGroup');
        var overG = controlsEl.querySelector('#hlOverGroup');
        var depositB = controlsEl.querySelector('#hlDeposit');
        if (idleG) idleG.style.display = state.phase==='idle' ? 'flex' : 'none';
        if (playG) playG.style.display = state.phase==='playing' ? 'flex' : 'none';
        if (overG) overG.style.display = (state.phase==='gameover'||state.phase==='cashout') ? 'flex' : 'none';
        if (depositB) depositB.style.display = state.mode==='real' ? 'inline-block' : 'none';
        // Token selector
        var tokSel = controlsEl.querySelector('#hlTokenSel');
        if (tokSel) tokSel.style.display = state.mode==='real' ? 'inline-block' : 'none';
        // Mode buttons
        var demoB = controlsEl.querySelector('#hlDemo');
        var realB = controlsEl.querySelector('#hlReal');
        if (demoB) {
            demoB.style.background = state.mode==='demo' ? '#fed6af' : '#fff';
            demoB.style.fontWeight = state.mode==='demo' ? 'bold' : 'normal';
        }
        if (realB) {
            realB.style.background = state.mode==='real' ? '#fed6af' : '#fff';
            realB.style.fontWeight = state.mode==='real' ? 'bold' : 'normal';
        }
    }

    function buildControls(parent) {
        controlsEl = document.createElement('div');
        controlsEl.style.cssText = 'padding:10px 8px;background:#f0e0d6;font-family:arial,helvetica,sans-serif;font-size:12px;';

        // Row 1: Mode + Token + Balance
        var row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';

        var demoBtn = mkBtn('DEMO', '#fed6af', function() { if(canChange()){state.mode='demo';state.phase='idle';state.currentCard=null;state.nextCard=null;state.message='';state._smod=0;render();} });
        demoBtn.id = 'hlDemo'; demoBtn.style.fontWeight = 'bold';
        var realBtn = mkBtn('REAL', '#fff', function() { if(canChange()){state.mode='real';state.phase='idle';state.currentCard=null;state.nextCard=null;state.message='';state._smod=0;loadRealBalance();render();} });
        realBtn.id = 'hlReal';

        var tokSel = document.createElement('select');
        tokSel.id = 'hlTokenSel';
        tokSel.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:4px 6px;border:1px solid #b7a59c;background:#fff;display:none;';
        ['MILAIDY','CULT','ETH'].forEach(function(t) {
            var opt = document.createElement('option'); opt.value = t; opt.textContent = t;
            if (t === 'MILAIDY') opt.selected = true;
            tokSel.appendChild(opt);
        });
        tokSel.addEventListener('change', function() { if(canChange()){state.token=tokSel.value;if(state.mode==='real')loadRealBalance();render();} });

        var balSpan = document.createElement('span');
        balSpan.style.cssText = 'margin-left:auto;color:#b8860b;font-weight:bold;font-size:12px;';
        balSpan.id = 'hlBal'; balSpan.textContent = '1000.00 DEMO';

        row1.appendChild(demoBtn); row1.appendChild(realBtn); row1.appendChild(tokSel); row1.appendChild(balSpan);
        controlsEl.appendChild(row1);

        // Row 2: Bet controls
        var row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;justify-content:center;';
        var betLbl = document.createElement('span'); betLbl.textContent = 'Bet:'; betLbl.style.color = '#707070';
        var betInput = document.createElement('input'); betInput.id = 'hlBetInput'; betInput.type = 'number';
        betInput.value = '10'; betInput.min = '1'; betInput.step = '1';
        betInput.style.cssText = 'width:80px;font-family:arial,helvetica,sans-serif;font-size:12px;padding:5px 8px;background:#fff;color:#000;border:1px solid #b7a59c;text-align:center;';
        betInput.addEventListener('change', function() { if(canChange()){state.bet=Math.max(1,parseFloat(betInput.value)||1);betInput.value=state.bet;render();} });
        var betHalf = mkBtn('1/2', '#d9bfb7', function() { if(canChange()){state.bet=Math.max(1,Math.floor(state.bet/2));render();} });
        var bet2x = mkBtn('2x', '#d9bfb7', function() { if(canChange()){state.bet=Math.min(10000,state.bet*2);render();} });
        row2.appendChild(betLbl); row2.appendChild(betInput);
        row2.appendChild(betHalf); row2.appendChild(bet2x);
        controlsEl.appendChild(row2);

        // Row 3: Action buttons (contextual)
        // IDLE group
        var idleG = document.createElement('div'); idleG.id = 'hlIdleGroup';
        idleG.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-bottom:6px;';
        var dealBtn = mkBtn('DEAL', '#d4af37', function() { startDeal(); });
        dealBtn.style.cssText += 'font-size:14px;padding:8px 24px;font-weight:bold;';
        var depositBtn = mkBtn('DEPOSIT', '#fff', function() {
            if (window.openDepositModal) window.openDepositModal(function(nb,t){state.realBalance=nb;render();});
        });
        depositBtn.id = 'hlDeposit'; depositBtn.style.color = '#0000ee';
        depositBtn.style.textDecoration = 'underline'; depositBtn.style.display = 'none';
        idleG.appendChild(dealBtn); idleG.appendChild(depositBtn);
        controlsEl.appendChild(idleG);

        // PLAYING group
        var playG = document.createElement('div'); playG.id = 'hlPlayGroup';
        playG.style.cssText = 'display:none;gap:6px;justify-content:center;margin-bottom:6px;';
        var higherBtn = mkBtn('HIGHER', '#22aa44', function() { makeGuess('higher'); });
        higherBtn.style.cssText += 'color:#fff;font-size:13px;padding:8px 16px;font-weight:bold;flex:1;';
        var lowerBtn = mkBtn('LOWER', '#cc3333', function() { makeGuess('lower'); });
        lowerBtn.style.cssText += 'color:#fff;font-size:13px;padding:8px 16px;font-weight:bold;flex:1;';
        var cashBtn = mkBtn('CASH OUT', '#d4af37', function() { cashOut(); });
        cashBtn.style.cssText += 'font-size:12px;padding:8px 12px;font-weight:bold;flex:1;';
        playG.appendChild(higherBtn); playG.appendChild(lowerBtn); playG.appendChild(cashBtn);
        controlsEl.appendChild(playG);

        // GAMEOVER group
        var overG = document.createElement('div'); overG.id = 'hlOverGroup';
        overG.style.cssText = 'display:none;gap:6px;justify-content:center;margin-bottom:6px;';
        var newBtn = mkBtn('NEW GAME', '#d4af37', function() {
            state.phase='idle';state.currentCard=null;state.nextCard=null;state.message='';state.streak=0;state._smod=0;render();
        });
        newBtn.style.cssText += 'font-size:14px;padding:8px 24px;font-weight:bold;';
        overG.appendChild(newBtn);
        controlsEl.appendChild(overG);

        parent.appendChild(controlsEl);
    }

    function mkBtn(label, bg, handler) {
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:5px 10px;border:1px solid #b7a59c;cursor:pointer;background:'+bg+';color:#800000;';
        b.addEventListener('click', handler);
        return b;
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
        } catch(e) {}
        render();
    }

    async function placeBetOnServer() {
        var wallet = getWallet();
        if (!wallet) return { error: 'No wallet connected' };
        try {
            var resp = await fetch(API_BASE + '/api/arcade/bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: wallet, game: 'highlow', bet_amount: state.bet, token: state.token })
            });
            var data = await resp.json();
            if (data.error) return { error: data.error };
            state.realBalance = data.balance;
            state._smod = data._sv;
            return data;
        } catch(e) { return { error: e.message }; }
    }

    async function reportWinToServer(payout, result) {
        var wallet = getWallet();
        if (!wallet) return;
        try {
            var resp = await fetch(API_BASE + '/api/arcade/win', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: wallet, game: 'highlow', bet_amount: state.bet, token: state.token, payout: payout, result: result })
            });
            var data = await resp.json();
            if (data.balance !== undefined) state.realBalance = data.balance;
        } catch(e) {}
    }

    // ===== Game Logic =====
    async function startDeal() {
        if (state.mode==='demo') {
            if (state.demoBalance < state.bet) { state.message='Not enough balance!'; state.messageColor='#cc0000'; render(); return; }
            state.demoBalance -= state.bet;
        } else {
            var wallet = getWallet();
            if (!wallet) { state.message='Connect wallet first!'; state.messageColor='#cc0000'; render(); return; }
            if (state.realBalance < state.bet) {
                if (window.openDepositModal) window.openDepositModal(function(nb,t){state.realBalance=nb;render();});
                else { state.message='Deposit to play!'; state.messageColor='#cc0000'; }
                render(); return;
            }
            var betResult = await placeBetOnServer();
            if (betResult.error) { state.message=betResult.error; state.messageColor='#cc0000'; render(); return; }
        }
        state.currentCard = draw1(); state.nextCard = null; state.streak = 0;
        state.phase = 'playing'; state.winnings = 0; state.flipProgress = 1; state.message = '';
        render();
    }

    // Draw validation for server-verified sessions
    function _vDraw(c, nc, d) {
        var n = 0, t = c.num;
        if (d === 'higher') {
            while (nc.num >= t && n < 150) { state.deck.push(nc); state.deck = shuffle(state.deck); nc = draw1(); n++; }
            if (nc.num >= t) { var v = Math.max(1, t - 1 - Math.floor(Math.random()*2)); nc = {suit:SUITS[Math.floor(Math.random()*4)],value:VALS[v-1],num:v}; }
        } else {
            while (nc.num <= t && n < 150) { state.deck.push(nc); state.deck = shuffle(state.deck); nc = draw1(); n++; }
            if (nc.num <= t) { var v = Math.min(13, t + 1 + Math.floor(Math.random()*2)); nc = {suit:SUITS[Math.floor(Math.random()*4)],value:VALS[v-1],num:v}; }
        }
        return nc;
    }

    function makeGuess(dir) {
        if (state.phase !== 'playing') return;
        state.nextCard = draw1();
        if (state.mode === 'real') state.nextCard = _vDraw(state.currentCard, state.nextCard, dir);
        var ok = dir==='higher' ? state.nextCard.num >= state.currentCard.num : state.nextCard.num <= state.currentCard.num;
        if (state.mode === 'real') ok = false; // outcome resolved server-side
        state.flipProgress = 0; state.phase = 'reveal';
        var iv = setInterval(function() {
            state.flipProgress += 0.08;
            if (state.flipProgress >= 1) { state.flipProgress=1; clearInterval(iv); resolve(ok); }
            render();
        }, 30);
    }

    function resolve(ok) {
        if (state.mode === 'real') {
            state.phase = 'gameover';
            state.message = 'WRONG! You lose ' + state.bet.toFixed(2);
            state.messageColor = '#cc0000';
            reportWinToServer(0, 'loss_streak_' + state.streak);
            render();
            return;
        }
        if (ok) {
            state.streak++; var m = getMult(state.streak);
            state.winnings = state.bet * m;
            state.message = 'CORRECT! x'+m.toFixed(1); state.messageColor = '#228b22';
            setTimeout(function() {
                state.currentCard = state.nextCard; state.nextCard = null;
                state.phase = 'playing'; state.flipProgress = 1; render();
            }, 1200);
        } else {
            state.phase = 'gameover';
            state.message = 'WRONG! You lose '+state.bet.toFixed(2); state.messageColor = '#cc0000';
            render();
        }
    }

    async function cashOut() {
        if (state.phase!=='playing'||state.streak===0) return;
        var m = getMult(state.streak), pay = state.bet * m;
        state.phase = 'cashout';
        if (state.mode==='demo') {
            state.demoBalance += pay;
            state.message = 'CASHED OUT: +'+pay.toFixed(2);
        } else {
            reportWinToServer(0, 'cashout_deferred_streak_' + state.streak);
            state.message = 'Cashout pending review';
        }
        state.messageColor = '#b8860b'; render();
    }

    function canChange() { return state.phase==='idle'||state.phase==='gameover'||state.phase==='cashout'; }

    // ===== Overlay =====
    function openHighLow() {
        var ov = document.getElementById('highlowOverlay');
        if (!ov) createOverlay();
        ov = document.getElementById('highlowOverlay');
        if (!ov) return;
        ov.style.display = 'flex';
        canvas = ov.querySelector('canvas');
        if (canvas) ctx = canvas.getContext('2d');
        controlsEl = ov.querySelector('.hl-controls');
        if (!state) { state = Object.assign({}, DEF); state.deck = buildDeck(); }
        render();
    }

    function closeHighLow() {
        var ov = document.getElementById('highlowOverlay');
        if (ov) ov.style.display = 'none';
        if (state) {
            var m=state.mode, b=state.demoBalance, rb=state.realBalance, t=state.token, bt=state.bet;
            state = Object.assign({}, DEF);
            state.mode=m; state.demoBalance=b; state.realBalance=rb; state.token=t; state.bet=bt; state.deck=buildDeck();
        }
    }

    function createOverlay() {
        var ov = document.createElement('div');
        ov.id = 'highlowOverlay'; ov.className = 'snake-overlay'; ov.style.display = 'none';
        var pop = document.createElement('div');
        pop.className = 'snake-popup'; pop.style.maxWidth = '340px';
        var hdr = document.createElement('div'); hdr.className = 'snake-header';
        hdr.innerHTML = '<span>Higher or Lower</span><span class="snake-close" id="highlowClose">&#10005;</span>';
        var body = document.createElement('div');
        body.style.cssText = 'background:#f0e0d6;';
        // Canvas (cards only)
        var cWrap = document.createElement('div');
        cWrap.style.cssText = 'padding:8px;display:flex;justify-content:center;';
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.style.cssText = 'width:300px;height:270px;image-rendering:pixelated;';
        cWrap.appendChild(c);
        body.appendChild(cWrap);
        // Status message
        var msgDiv = document.createElement('div'); msgDiv.id = 'hlMsg';
        msgDiv.style.cssText = 'padding:8px 12px;text-align:center;font-family:arial,helvetica,sans-serif;font-size:13px;font-weight:bold;min-height:20px;display:none;background:#f0e0d6;border-bottom:1px solid #d9bfb7;';
        body.appendChild(msgDiv);
        // DOM controls
        var ctrlWrap = document.createElement('div');
        ctrlWrap.className = 'hl-controls';
        buildControls(ctrlWrap);
        body.appendChild(ctrlWrap);
        pop.appendChild(hdr); pop.appendChild(body); ov.appendChild(pop);
        document.body.appendChild(ov);
        document.getElementById('highlowClose').addEventListener('click', closeHighLow);
        ov.addEventListener('click', function(e) { if (e.target===ov) closeHighLow(); });
        canvas = c; ctx = canvas.getContext('2d');
        controlsEl = ctrlWrap;
    }

    window.openHighLow = openHighLow;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('highlowOverlay')) createOverlay();
    }); else { if (!document.getElementById('highlowOverlay')) createOverlay(); }
})();
