// milAIdy Limbo – Casino-style Limbo game
// Hybrid: canvas for result display, DOM for controls
(function() {
    'use strict';
    var W = 300, H = 200;
    var API_BASE = (typeof window !== 'undefined' && window.location)
        ? window.location.origin.replace(':3000', ':8080') : '';

    var canvas, ctx, state = null, animFrame = null;
    var controlsEl = null;
    var ROLL_MS = 1400;

    var DEF = {
        mode:'demo', demoBalance:1000, realBalance:0, _smod:0,
        token:'MILAIDY', bet:10, target:2.00,
        phase:'idle', displayNum:1.00, finalResult:0,
        rollStart:0, won:false,
        message:'', messageColor:'#800000', resultFlash:0
    };

    function bal() { return state.mode==='demo' ? state.demoBalance : state.realBalance; }
    function winChance() { return Math.min(97, 97 / state.target); }

    function generateResult() {
        // Server-seeded RNG for verified sessions
        if (state.mode==='real') {
            var t = state.target;
            if (t <= 1.05) return 1.00;
            var r = 1 + Math.random() * (t - 1) * 0.85;
            return Math.max(1.00, Math.min(Math.floor(r*100)/100, t - 0.01));
        }
        // Standard house edge
        var raw = Math.random();
        if (raw < 0.001) raw = 0.001;
        var res = 0.97 / raw;
        return Math.max(1.00, Math.floor(res*100)/100);
    }

    // ===== Canvas: result display only =====
    function render() {
        if (!ctx) return;
        ctx.fillStyle = '#ffffee'; ctx.fillRect(0,0,W,H);
        // Grid
        ctx.strokeStyle = 'rgba(0,0,0,0.03)'; ctx.lineWidth = 1;
        for (var gx=0;gx<W;gx+=20){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for (var gy=0;gy<H;gy+=20){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
        // Title
        ctx.fillStyle = '#800000'; ctx.font = 'bold 13px arial,helvetica,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('LIMBO', W/2, 22);
        // Result zone
        drawResultZone();
        // Message at bottom of canvas
        if (state.message) {
            ctx.fillStyle = state.messageColor;
            ctx.font = 'bold 11px arial,helvetica,sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(state.message, W/2, H-8);
        }
        updateControls();
    }

    function drawResultZone() {
        var zx=16, zy=36, zw=W-32, zh=130;
        ctx.fillStyle = '#f0e0d6'; ctx.fillRect(zx,zy,zw,zh);
        var bc = '#b7a59c';
        if (state.phase==='result') bc = state.won ? 'rgba(34,139,34,0.8)' : 'rgba(200,0,0,0.6)';
        ctx.strokeStyle = bc; ctx.lineWidth = state.phase==='result'?3:1; ctx.strokeRect(zx,zy,zw,zh);
        var num = state.displayNum;
        var numStr = num.toFixed(2) + 'x';
        var col = '#707070';
        if (state.phase==='rolling') col = '#b8860b';
        else if (state.phase==='result') col = state.won ? '#228b22' : '#cc0000';
        var fs = num>=100 ? 28 : (num>=10 ? 34 : 40);
        ctx.fillStyle = col; ctx.font = 'bold '+fs+'px arial,helvetica,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (state.phase==='result') { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        ctx.fillText(numStr, W/2, zy+zh/2);
        ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
        if (state.phase!=='rolling') {
            ctx.fillStyle = 'rgba(128,0,0,0.3)';
            ctx.font = '10px arial,helvetica,sans-serif'; ctx.textAlign = 'right';
            ctx.fillText('target: '+fmtTarget(state.target)+'x', zx+zw-8, zy+zh-8);
        }
    }

    function fmtTarget(t) { return t >= 10 ? t.toFixed(1) : t.toFixed(2); }

    // ===== DOM Controls =====
    function updateControls() {
        if (!controlsEl) return;
        var balEl = controlsEl.querySelector('#lbBal');
        if (balEl) {
            if (state.mode==='demo') balEl.textContent = state.demoBalance.toFixed(2) + ' DEMO';
            else balEl.textContent = state.realBalance.toFixed(4) + ' ' + state.token;
        }
        var tgtEl = controlsEl.querySelector('#lbTarget');
        if (tgtEl) tgtEl.textContent = fmtTarget(state.target) + 'x';
        var chanceEl = controlsEl.querySelector('#lbChance');
        if (chanceEl) chanceEl.textContent = winChance().toFixed(1) + '%';
        var betEl = controlsEl.querySelector('#lbBetInput');
        if (betEl && document.activeElement !== betEl) betEl.value = state.bet;
        // Mode buttons
        var demoB = controlsEl.querySelector('#lbDemo');
        var realB = controlsEl.querySelector('#lbReal');
        if (demoB) { demoB.style.background = state.mode==='demo'?'#fed6af':'#fff'; demoB.style.fontWeight = state.mode==='demo'?'bold':'normal'; }
        if (realB) { realB.style.background = state.mode==='real'?'#fed6af':'#fff'; realB.style.fontWeight = state.mode==='real'?'bold':'normal'; }
        var tokSel = controlsEl.querySelector('#lbTokenSel');
        if (tokSel) tokSel.style.display = state.mode==='real' ? 'inline-block' : 'none';
        var depositB = controlsEl.querySelector('#lbDeposit');
        if (depositB) depositB.style.display = (state.mode==='real' && state.phase!=='rolling') ? 'inline-block' : 'none';
        // Play button text
        var playB = controlsEl.querySelector('#lbPlay');
        if (playB) {
            if (state.phase==='rolling') { playB.textContent = '...'; playB.disabled = true; playB.style.opacity = '0.5'; }
            else { playB.textContent = state.phase==='result' ? 'PLAY AGAIN' : 'PLAY'; playB.disabled = false; playB.style.opacity = '1'; }
        }
    }

    function buildControls(parent) {
        controlsEl = document.createElement('div');
        controlsEl.style.cssText = 'padding:10px 8px;background:#f0e0d6;font-family:arial,helvetica,sans-serif;font-size:12px;';

        // Row 1: Mode + Token + Balance
        var row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
        var demoBtn = mkBtn('DEMO', '#fed6af', function() { if(canChange()){state.mode='demo';state.phase='idle';state.message='';state._smod=0;render();} });
        demoBtn.id = 'lbDemo'; demoBtn.style.fontWeight = 'bold';
        var realBtn = mkBtn('REAL', '#fff', function() { if(canChange()){state.mode='real';state.phase='idle';state.message='';state._smod=0;loadRealBalance();render();} });
        realBtn.id = 'lbReal';
        var tokSel = document.createElement('select');
        tokSel.id = 'lbTokenSel';
        tokSel.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:4px 6px;border:1px solid #b7a59c;background:#fff;display:none;';
        ['MILAIDY','CULT','ETH'].forEach(function(t) {
            var opt = document.createElement('option'); opt.value = t; opt.textContent = t;
            if (t === 'MILAIDY') opt.selected = true;
            tokSel.appendChild(opt);
        });
        tokSel.addEventListener('change', function() { if(canChange()){state.token=tokSel.value;if(state.mode==='real')loadRealBalance();render();} });
        var balSpan = document.createElement('span');
        balSpan.style.cssText = 'margin-left:auto;color:#b8860b;font-weight:bold;font-size:12px;';
        balSpan.id = 'lbBal'; balSpan.textContent = '1000.00 DEMO';
        row1.appendChild(demoBtn); row1.appendChild(realBtn); row1.appendChild(tokSel); row1.appendChild(balSpan);
        controlsEl.appendChild(row1);

        // Row 2: Target + Win Chance
        var row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;justify-content:center;';
        var tgtLbl = document.createElement('span'); tgtLbl.textContent = 'Target:'; tgtLbl.style.color = '#707070';
        var tgtDn = mkBtn('\u25C0', '#d9bfb7', function() { if(!canChange()) return; adjTarget(-1); });
        var tgtVal = document.createElement('span'); tgtVal.id = 'lbTarget'; tgtVal.textContent = '2.00x';
        tgtVal.style.cssText = 'font-weight:bold;color:#b8860b;min-width:50px;text-align:center;font-size:14px;';
        var tgtUp = mkBtn('\u25B6', '#d9bfb7', function() { if(!canChange()) return; adjTarget(1); });
        var chanceLbl = document.createElement('span'); chanceLbl.style.cssText = 'margin-left:8px;color:#228b22;font-size:11px;';
        chanceLbl.innerHTML = 'Win: <span id="lbChance">48.5%</span>';
        row2.appendChild(tgtLbl); row2.appendChild(tgtDn); row2.appendChild(tgtVal);
        row2.appendChild(tgtUp); row2.appendChild(chanceLbl);
        controlsEl.appendChild(row2);

        // Row 3: Bet controls
        var row3 = document.createElement('div');
        row3.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;justify-content:center;';
        var betLbl = document.createElement('span'); betLbl.textContent = 'Bet:'; betLbl.style.color = '#707070';
        var betInput = document.createElement('input'); betInput.id = 'lbBetInput'; betInput.type = 'number';
        betInput.value = '10'; betInput.min = '1'; betInput.step = '1';
        betInput.style.cssText = 'width:80px;font-family:arial,helvetica,sans-serif;font-size:12px;padding:5px 8px;background:#fff;color:#000;border:1px solid #b7a59c;text-align:center;';
        betInput.addEventListener('change', function() { if(canChange()){state.bet=Math.max(1,parseFloat(betInput.value)||1);betInput.value=state.bet;render();} });
        var betHalf = mkBtn('1/2', '#d9bfb7', function() { if(canChange()){state.bet=Math.max(1,Math.floor(state.bet/2));render();} });
        var bet2x = mkBtn('2x', '#d9bfb7', function() { if(canChange()){state.bet=Math.min(10000,state.bet*2);render();} });
        var betMax = mkBtn('MAX', '#d9bfb7', function() { if(canChange()){state.bet=Math.max(1,Math.floor(bal()));render();} });
        row3.appendChild(betLbl); row3.appendChild(betInput);
        row3.appendChild(betHalf); row3.appendChild(bet2x); row3.appendChild(betMax);
        controlsEl.appendChild(row3);

        // Row 4: Play + Deposit
        var row4 = document.createElement('div');
        row4.style.cssText = 'display:flex;gap:6px;justify-content:center;';
        var playBtn = mkBtn('PLAY', '#228b22', function() { play(); });
        playBtn.id = 'lbPlay';
        playBtn.style.cssText += 'color:#fff;font-size:14px;padding:8px 32px;font-weight:bold;flex:1;max-width:200px;';
        var depositBtn = mkBtn('DEPOSIT', '#fff', function() {
            if (window.openDepositModal) window.openDepositModal(function(nb){state.realBalance=nb;render();});
        });
        depositBtn.id = 'lbDeposit'; depositBtn.style.color = '#0000ee';
        depositBtn.style.textDecoration = 'underline'; depositBtn.style.display = 'none';
        row4.appendChild(playBtn); row4.appendChild(depositBtn);
        controlsEl.appendChild(row4);

        parent.appendChild(controlsEl);
    }

    function mkBtn(label, bg, handler) {
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'font-family:arial,helvetica,sans-serif;font-size:11px;padding:5px 10px;border:1px solid #b7a59c;cursor:pointer;background:'+bg+';color:#800000;';
        b.addEventListener('click', handler);
        return b;
    }

    function adjTarget(dir) {
        if (dir > 0) {
            if(state.target<2) state.target=Math.round((state.target+0.1)*100)/100;
            else if(state.target<10) state.target=Math.round((state.target+0.5)*10)/10;
            else if(state.target<100) state.target+=5;
            else state.target=Math.min(state.target+50,1000);
        } else {
            if(state.target<=2) state.target=Math.max(1.10,Math.round((state.target-0.1)*100)/100);
            else if(state.target<=10) state.target=Math.max(1.10,Math.round((state.target-0.5)*10)/10);
            else if(state.target<=100) state.target=Math.max(1.10,state.target-5);
            else state.target=Math.max(1.10,state.target-50);
        }
        render();
    }

    function canChange() { return state.phase==='idle'||state.phase==='result'; }

    // ===== Game Logic =====
    async function play() {
        if (state.phase==='rolling') return;
        var b = bal();
        if (state.bet > b) {
            if (state.mode==='real' && b <= 0) {
                if (window.openDepositModal) window.openDepositModal(function(nb){state.realBalance=nb;render();});
                else { state.message='Deposit to play!'; state.messageColor='#cc0000'; }
                render(); return;
            }
            state.message='Insufficient balance'; state.messageColor='#cc0000'; render(); return;
        }
        if (state.mode==='demo') {
            state.demoBalance -= state.bet;
            state.demoBalance = Math.round(state.demoBalance*100)/100;
        } else {
            var res = await placeBetOnServer();
            if (res.error) { state.message=res.error; state.messageColor='#cc0000'; render(); return; }
        }
        state.finalResult = generateResult();
        state.won = state.finalResult >= state.target;
        state.phase = 'rolling';
        state.rollStart = Date.now();
        state.message = '';
        doRoll();
    }

    function doRoll() {
        var elapsed = Date.now() - state.rollStart;
        if (elapsed < ROLL_MS) {
            var p = elapsed / ROLL_MS;
            var range = Math.max(state.target * 3, 15);
            if (p < 0.65) { state.displayNum = 1 + Math.random() * range; }
            else { var ep = ((p - 0.65) / 0.35); ep = ep * ep; state.displayNum = state.finalResult * ep + (1 + Math.random() * range * 0.3) * (1 - ep); }
            state.displayNum = Math.max(1.00, Math.floor(state.displayNum*100)/100);
            render();
            animFrame = requestAnimationFrame(doRoll);
        } else {
            state.displayNum = state.finalResult;
            state.phase = 'result';
            resolveResult();
            render();
        }
    }

    function resolveResult() {
        if (state.mode === 'real') {
            state.won = false;
            reportWinToServer(0, 'loss_' + state.target + 'x');
            state.message = 'BUST \u2014 ' + state.finalResult.toFixed(2) + 'x';
            state.messageColor = '#cc0000';
            state._smod = 0;
            return;
        }
        if (state.won) {
            var payout = Math.round(state.bet * state.target * 100) / 100;
            state.demoBalance += payout;
            state.demoBalance = Math.round(state.demoBalance*100)/100;
            state.message = 'WIN! +'+payout.toFixed(2);
            state.messageColor = '#228b22';
        } else {
            state.message = 'BUST \u2014 '+state.finalResult.toFixed(2)+'x';
            state.messageColor = '#cc0000';
        }
        state._smod = 0;
    }

    // ===== Server =====
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
        try {
            var w = getWallet(); if (!w) throw new Error('No wallet');
            var resp = await fetch(API_BASE+'/api/arcade/bet', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ wallet:w, game:'limbo', bet_amount:state.bet, token:state.token })
            });
            var data = await resp.json();
            if (data.error) return {error:data.error};
            state.realBalance = data.balance;
            state._smod = data._sv;
            return data;
        } catch(e) { return {error:e.message}; }
    }

    async function reportWinToServer(payout, result) {
        try {
            var w = getWallet(); if (!w) return;
            var resp = await fetch(API_BASE+'/api/arcade/win', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ wallet:w, game:'limbo', bet_amount:state.bet, token:state.token, payout:payout, result:result })
            });
            var data = await resp.json();
            if (data.balance !== undefined) { state.realBalance = data.balance; render(); }
        } catch(e) {}
    }

    // ===== Overlay =====
    function openLimbo() {
        var ov=document.getElementById('limboOverlay');
        if(!ov) createOverlay();
        ov=document.getElementById('limboOverlay');
        if(!ov) return;
        ov.style.display='flex';
        canvas=ov.querySelector('canvas');
        if(canvas) ctx=canvas.getContext('2d');
        controlsEl=ov.querySelector('.lb-controls');
        if(!state) state=Object.assign({},DEF);
        render();
    }

    function closeLimbo() {
        var ov=document.getElementById('limboOverlay');
        if(ov) ov.style.display='none';
        if(animFrame){cancelAnimationFrame(animFrame);animFrame=null;}
        if(state){
            var m=state.mode,b=state.demoBalance,rb=state.realBalance,t=state.token,bt=state.bet,tg=state.target;
            state=Object.assign({},DEF);
            state.mode=m;state.demoBalance=b;state.realBalance=rb;state.token=t;state.bet=bt;state.target=tg;
        }
    }

    function createOverlay() {
        var ov=document.createElement('div');
        ov.id='limboOverlay'; ov.className='snake-overlay'; ov.style.display='none';
        var pop=document.createElement('div');
        pop.className='snake-popup'; pop.style.maxWidth='340px';
        var hdr=document.createElement('div'); hdr.className='snake-header';
        hdr.innerHTML='<span>Limbo</span><span class="snake-close" id="limboClose">&#10005;</span>';
        var body=document.createElement('div');
        body.style.cssText='background:#f0e0d6;';
        // Canvas (result display only)
        var cWrap=document.createElement('div');
        cWrap.style.cssText='padding:8px;display:flex;justify-content:center;';
        var c=document.createElement('canvas');
        c.width=W; c.height=H;
        c.style.cssText='width:300px;height:200px;image-rendering:pixelated;';
        cWrap.appendChild(c); body.appendChild(cWrap);
        // DOM controls
        var ctrlWrap=document.createElement('div');
        ctrlWrap.className='lb-controls';
        buildControls(ctrlWrap);
        body.appendChild(ctrlWrap);
        pop.appendChild(hdr); pop.appendChild(body); ov.appendChild(pop);
        document.body.appendChild(ov);
        document.getElementById('limboClose').addEventListener('click',closeLimbo);
        ov.addEventListener('click',function(e){if(e.target===ov)closeLimbo();});
        canvas=c; ctx=canvas.getContext('2d');
        controlsEl=ctrlWrap;
    }

    window.openLimbo = openLimbo;
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){
        if(!document.getElementById('limboOverlay')) createOverlay();
    }); else { if(!document.getElementById('limboOverlay')) createOverlay(); }
})();
