// milAIdy Gotchi - Virtual Pet (Tamagotchi Edition)
(function() {
    const W = 240, H = 280;
    const GB_BG = '#9bbc0f';
    const GB_LIGHT = '#8bac0f';
    const GB_MED = '#306230';
    const GB_DARK = '#0f380f';
    const SAVE_KEY = 'miladyGotchi';
    const DAY_MS = 86400000;

    let canvas, ctx, pet, animFrame, blinkTimer;

    // ===== Pixel art milady sprites (16x16 grid, drawn procedurally) =====
    // Each milady is defined by: hair color, hair style, accessory, outfit
    const MILADYS = [
        { name:'Aloha-chan', hair:'#5a8a5a', style:'visor', acc:'visor', outfit:'leopard', skin:'#f5deb3' },
        { name:'Goth-chan', hair:'#5a8a5a', style:'bob', acc:'headphones', outfit:'cross', skin:'#f0e0d0' },
        { name:'Bucket-chan', hair:'#7ab87a', style:'long', acc:'bucket', outfit:'jacket', skin:'#8b6914' },
        { name:'Garden-chan', hair:'#4a7a4a', style:'curly', acc:'none', outfit:'floral', skin:'#f5deb3' },
        { name:'Ribbon-chan', hair:'#c8a832', style:'straight', acc:'ribbon', outfit:'argyle', skin:'#f5deb3' },
        { name:'Remilia-chan', hair:'#6a4aa0', style:'cap', acc:'cap', outfit:'tee', skin:'#d0e0d0' },
    ];

    // Draw a pixel-art milady on canvas at (ox, oy), scale s
    function drawMilady(ox, oy, s, m, mood, blink) {
        const p = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x*s, oy + y*s, s, s); };
        const skin = m.skin;
        const hair = m.hair;
        const dark = GB_DARK;
        const eye = blink ? skin : dark;

        // Hair top
        for (let x = 3; x <= 12; x++) p(x, 0, hair);
        for (let x = 2; x <= 13; x++) p(x, 1, hair);
        for (let x = 1; x <= 14; x++) p(x, 2, hair);
        // Side hair
        for (let y = 3; y <= 8; y++) { p(1, y, hair); p(2, y, hair); p(13, y, hair); p(14, y, hair); }

        // Face
        for (let y = 3; y <= 8; y++) for (let x = 3; x <= 12; x++) p(x, y, skin);

        // Eyes (big anime style) - row 4-6
        // Left eye
        p(4, 4, dark); p(5, 4, dark);
        p(4, 5, eye); p(5, 5, eye);
        p(4, 6, dark); p(5, 6, dark);
        // Right eye
        p(10, 4, dark); p(11, 4, dark);
        p(10, 5, eye); p(11, 5, eye);
        p(10, 6, dark); p(11, 6, dark);
        // Eye shine
        if (!blink) { p(5, 4, '#ffffff'); p(11, 4, '#ffffff'); }

        // Mouth based on mood
        if (mood === 'happy') {
            p(7, 7, dark); p(8, 7, dark);
        } else if (mood === 'sad') {
            p(6, 8, dark); p(7, 7, dark); p(8, 7, dark); p(9, 8, dark);
        } else if (mood === 'dead') {
            p(7, 7, dark); p(8, 7, dark); p(6, 7, dark); p(9, 7, dark);
            // X eyes
            p(4, 4, dark); p(5, 5, dark); p(5, 4, dark); p(4, 5, dark);
            p(10, 4, dark); p(11, 5, dark); p(11, 4, dark); p(10, 5, dark);
        } else {
            p(7, 7, dark); p(8, 7, dark);
        }

        // Nose
        p(7, 6, '#d4a574');

        // Accessory
        if (m.acc === 'visor') {
            for (let x = 2; x <= 13; x++) p(x, 1, '#ffffff');
            for (let x = 1; x <= 14; x++) p(x, 2, '#d0c0a0');
        } else if (m.acc === 'headphones') {
            p(1, 4, dark); p(1, 5, dark); p(14, 4, dark); p(14, 5, dark);
            for (let x = 2; x <= 13; x++) p(x, 0, dark);
        } else if (m.acc === 'bucket') {
            for (let x = 1; x <= 14; x++) p(x, 0, '#4a4a4a');
            for (let x = 0; x <= 15; x++) p(x, 1, '#3a3a3a');
        } else if (m.acc === 'ribbon') {
            p(11, 1, '#ff69b4'); p(12, 1, '#ff69b4'); p(12, 0, '#ff69b4');
        } else if (m.acc === 'cap') {
            for (let x = 1; x <= 14; x++) p(x, 0, '#3a3aff');
            for (let x = 0; x <= 15; x++) p(x, 1, '#3a3aff');
            // Brim
            for (let x = 0; x <= 8; x++) p(x, 2, '#2a2ae0');
        }

        // Body (rows 9-14)
        for (let y = 9; y <= 14; y++) for (let x = 3; x <= 12; x++) p(x, y, GB_MED);
        // Neck
        p(7, 9, skin); p(8, 9, skin);

        // Outfit details
        if (m.outfit === 'cross') {
            p(7, 11, '#ffffff'); p(8, 11, '#ffffff');
            p(7, 12, '#ffffff'); p(8, 12, '#ffffff'); p(6, 11, '#ffffff'); p(9, 11, '#ffffff');
        } else if (m.outfit === 'leopard') {
            p(5, 11, '#c8a032'); p(7, 12, '#c8a032'); p(10, 11, '#c8a032');
        } else if (m.outfit === 'floral') {
            p(5, 11, '#ff6666'); p(8, 12, '#ffaa00'); p(10, 11, '#ff6666');
        } else if (m.outfit === 'argyle') {
            p(6, 11, '#666699'); p(8, 10, '#666699'); p(10, 11, '#666699');
        }

        // Arms
        p(2, 10, skin); p(2, 11, skin);
        p(13, 10, skin); p(13, 11, skin);

        // Feet
        p(5, 15, dark); p(6, 15, dark); p(9, 15, dark); p(10, 15, dark);
    }

    // ===== Pet state management =====
    function newPet(miladyIndex) {
        return {
            miladyIndex: miladyIndex,
            name: MILADYS[miladyIndex].name,
            hunger: 80,
            happiness: 80,
            energy: 80,
            age: 0,
            born: Date.now(),
            lastVisit: Date.now(),
            alive: true,
            totalFeeds: 0,
            totalPlays: 0,
        };
    }

    function loadPet() {
        try {
            const d = JSON.parse(localStorage.getItem(SAVE_KEY));
            if (d && d.alive !== undefined) return d;
        } catch(e) {}
        return null;
    }

    function savePet() {
        if (pet) localStorage.setItem(SAVE_KEY, JSON.stringify(pet));
    }

    function applyTimeDecay() {
        if (!pet || !pet.alive) return;
        const elapsed = Date.now() - pet.lastVisit;
        const hours = elapsed / 3600000;
        // Stats decay ~5 per hour away
        const decay = Math.min(Math.floor(hours * 5), 100);
        pet.hunger = Math.max(0, pet.hunger - decay);
        pet.happiness = Math.max(0, pet.happiness - decay);
        pet.energy = Math.max(0, pet.energy - Math.floor(decay * 0.5));
        pet.age = Math.floor((Date.now() - pet.born) / DAY_MS);
        pet.lastVisit = Date.now();
        // Death check
        if (pet.hunger <= 0 && pet.happiness <= 0) {
            pet.alive = false;
        }
        savePet();
    }

    function getMood() {
        if (!pet.alive) return 'dead';
        const avg = (pet.hunger + pet.happiness + pet.energy) / 3;
        if (avg >= 60) return 'happy';
        if (avg >= 30) return 'neutral';
        return 'sad';
    }

    // ===== Actions =====
    function feedPet() {
        if (!pet || !pet.alive) return;
        pet.hunger = Math.min(100, pet.hunger + 20);
        pet.energy = Math.min(100, pet.energy + 5);
        pet.totalFeeds++;
        pet.lastVisit = Date.now();
        savePet();
        showAction('NOM NOM!');
    }

    function playWithPet() {
        if (!pet || !pet.alive) return;
        pet.happiness = Math.min(100, pet.happiness + 20);
        pet.energy = Math.max(0, pet.energy - 10);
        pet.hunger = Math.max(0, pet.hunger - 5);
        pet.totalPlays++;
        pet.lastVisit = Date.now();
        savePet();
        showAction('~uwu~');
    }

    function sleepPet() {
        if (!pet || !pet.alive) return;
        pet.energy = Math.min(100, pet.energy + 30);
        pet.hunger = Math.max(0, pet.hunger - 5);
        pet.lastVisit = Date.now();
        savePet();
        showAction('zzZ...');
    }

    let actionText = '';
    let actionTimer = 0;
    function showAction(text) {
        actionText = text;
        actionTimer = 60; // frames
    }

    // ===== Rendering =====
    function render() {
        if (!canvas || !ctx) return;
        // GB green background
        ctx.fillStyle = GB_BG;
        ctx.fillRect(0, 0, W, H);

        if (!pet) {
            renderSelectScreen();
        } else if (!pet.alive) {
            renderDeadScreen();
        } else {
            renderPetScreen();
        }

        animFrame = requestAnimationFrame(render);
    }

    let selectIndex = 0;
    let selectScroll = 0;

    function renderSelectScreen() {
        ctx.fillStyle = GB_DARK;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MILADYGOTCHI', W/2, 22);

        ctx.font = '9px monospace';
        ctx.fillText('choose your milady', W/2, 38);

        // Draw border
        ctx.strokeStyle = GB_DARK;
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 45, W-20, 180);

        // Selected milady preview (large)
        const m = MILADYS[selectIndex];
        drawMilady(80, 55, 5, m, 'happy', false);

        // Name
        ctx.fillStyle = GB_DARK;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, W/2, 150);

        // Arrows
        ctx.font = 'bold 18px monospace';
        ctx.fillText('<', 30, 105);
        ctx.fillText('>', W-30, 105);

        // All miladys small at bottom
        for (let i = 0; i < MILADYS.length; i++) {
            const sx = 20 + i * 36;
            const sy = 160;
            if (i === selectIndex) {
                ctx.strokeStyle = GB_DARK;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx - 2, sy - 2, 32, 32);
            }
            drawMilady(sx + 2, sy + 2, 1.7, MILADYS[i], 'happy', false);
        }

        // Adopt button
        ctx.fillStyle = GB_DARK;
        ctx.fillRect(70, 232, 100, 24);
        ctx.fillStyle = GB_BG;
        ctx.font = 'bold 12px monospace';
        ctx.fillText('[ ADOPT ]', W/2, 248);

        // Instructions
        ctx.fillStyle = GB_MED;
        ctx.font = '8px monospace';
        ctx.fillText('arrows to browse, enter to adopt', W/2, 272);
    }

    function renderPetScreen() {
        const m = MILADYS[pet.miladyIndex] || MILADYS[0];
        const mood = getMood();

        // Top bar
        ctx.fillStyle = GB_DARK;
        ctx.fillRect(0, 0, W, 20);
        ctx.fillStyle = GB_BG;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(pet.name, 4, 14);
        ctx.textAlign = 'right';
        ctx.fillText('Day ' + pet.age, W - 4, 14);

        // Pet area
        ctx.strokeStyle = GB_MED;
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 25, W-16, 120);

        // Draw pet with blink animation
        const blink = blinkTimer > 0 && blinkTimer < 5;
        const bobY = Math.sin(Date.now() / 500) * 2;
        drawMilady(72, 35 + bobY, 6, m, mood, blink);

        // Action text
        if (actionTimer > 0) {
            actionTimer--;
            ctx.fillStyle = GB_DARK;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(actionText, W/2, 45);
        }

        // Mood text
        ctx.fillStyle = GB_MED;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        const moodTexts = { happy: '^ w ^', neutral: '- _ -', sad: '; _ ;', dead: 'x _ x' };
        ctx.fillText(moodTexts[mood] || '...', W/2, 140);

        // Stats bars
        const barY = 152;
        drawStatBar(12, barY, 'HUNGER', pet.hunger);
        drawStatBar(12, barY + 22, 'HAPPY', pet.happiness);
        drawStatBar(12, barY + 44, 'ENERGY', pet.energy);

        // Action buttons
        const btnY = 243;
        drawButton(8, btnY, 68, 'FEED');
        drawButton(86, btnY, 68, 'PLAY');
        drawButton(164, btnY, 68, 'SLEEP');

        // Bottom info
        ctx.fillStyle = GB_MED;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('feeds:' + pet.totalFeeds + ' plays:' + pet.totalPlays, W/2, 275);
    }

    function drawStatBar(x, y, label, val) {
        ctx.fillStyle = GB_DARK;
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, x, y + 8);
        // Bar background
        const bx = x + 52, bw = W - 72, bh = 12;
        ctx.fillStyle = GB_LIGHT;
        ctx.fillRect(bx, y, bw, bh);
        ctx.strokeStyle = GB_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, y, bw, bh);
        // Bar fill
        const fillW = Math.floor((val / 100) * (bw - 2));
        ctx.fillStyle = val > 50 ? GB_DARK : (val > 20 ? GB_MED : '#aa0000');
        ctx.fillRect(bx + 1, y + 1, fillW, bh - 2);
        // Value text
        ctx.fillStyle = val > 50 ? GB_BG : '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val + '%', bx + bw/2, y + 9);
    }

    function drawButton(x, y, w, label) {
        ctx.fillStyle = GB_DARK;
        ctx.fillRect(x, y, w, 22);
        ctx.fillStyle = GB_BG;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w/2, y + 15);
    }

    function renderDeadScreen() {
        ctx.fillStyle = GB_DARK;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MILADYGOTCHI', W/2, 30);

        const m = MILADYS[pet.miladyIndex] || MILADYS[0];
        drawMilady(72, 50, 6, m, 'dead', false);

        ctx.fillStyle = GB_DARK;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(pet.name + ' has passed...', W/2, 160);
        ctx.font = '9px monospace';
        ctx.fillText('Lived ' + pet.age + ' days', W/2, 178);
        ctx.fillText(pet.totalFeeds + ' feeds, ' + pet.totalPlays + ' plays', W/2, 194);

        // Restart button
        ctx.fillStyle = GB_DARK;
        ctx.fillRect(60, 215, 120, 24);
        ctx.fillStyle = GB_BG;
        ctx.font = 'bold 11px monospace';
        ctx.fillText('[ NEW PET ]', W/2, 231);

        ctx.fillStyle = GB_MED;
        ctx.font = '8px monospace';
        ctx.fillText('click or press enter', W/2, 260);
    }

    // ===== Input handling =====
    function handleClick(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        if (!pet) {
            // Select screen
            if (my >= 55 && my <= 145) {
                if (mx < W/2 - 40) { selectIndex = (selectIndex - 1 + MILADYS.length) % MILADYS.length; }
                else if (mx > W/2 + 40) { selectIndex = (selectIndex + 1) % MILADYS.length; }
            }
            // Small milady thumbnails
            if (my >= 160 && my <= 192) {
                for (let i = 0; i < MILADYS.length; i++) {
                    if (mx >= 20 + i*36 && mx <= 52 + i*36) { selectIndex = i; break; }
                }
            }
            // Adopt button
            if (mx >= 70 && mx <= 170 && my >= 232 && my <= 256) {
                pet = newPet(selectIndex);
                savePet();
            }
        } else if (!pet.alive) {
            // New pet button
            if (mx >= 60 && mx <= 180 && my >= 215 && my <= 239) {
                localStorage.removeItem(SAVE_KEY);
                pet = null;
                selectIndex = 0;
            }
        } else {
            // Action buttons
            const btnY = 243;
            if (my >= btnY && my <= btnY + 22) {
                if (mx >= 8 && mx <= 76) feedPet();
                else if (mx >= 86 && mx <= 154) playWithPet();
                else if (mx >= 164 && mx <= 232) sleepPet();
            }
        }
    }

    function handleKey(e) {
        const overlay = document.getElementById('gotchiOverlay');
        if (!overlay || overlay.style.display === 'none') return;

        if (!pet) {
            if (e.key === 'ArrowLeft') { selectIndex = (selectIndex - 1 + MILADYS.length) % MILADYS.length; e.preventDefault(); }
            else if (e.key === 'ArrowRight') { selectIndex = (selectIndex + 1) % MILADYS.length; e.preventDefault(); }
            else if (e.key === 'Enter') { pet = newPet(selectIndex); savePet(); e.preventDefault(); }
        } else if (!pet.alive) {
            if (e.key === 'Enter') { localStorage.removeItem(SAVE_KEY); pet = null; selectIndex = 0; e.preventDefault(); }
        } else {
            if (e.key === '1') feedPet();
            else if (e.key === '2') playWithPet();
            else if (e.key === '3') sleepPet();
        }
    }

    // ===== Blink timer =====
    function blinkLoop() {
        blinkTimer = 8;
        const countdown = setInterval(() => {
            blinkTimer--;
            if (blinkTimer <= 0) { clearInterval(countdown); }
        }, 60);
        setTimeout(blinkLoop, 3000 + Math.random() * 4000);
    }

    // ===== Init =====
    function initGotchi() {
        const overlay = document.getElementById('gotchiOverlay');
        if (!overlay) return;

        canvas = document.getElementById('gotchiCanvas');
        ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;
        ctx.imageSmoothingEnabled = false;

        document.getElementById('gotchiClose').addEventListener('click', closeGotchi);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGotchi(); });
        canvas.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKey);

        blinkLoop();
    }

    function openGotchi() {
        const overlay = document.getElementById('gotchiOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';

        // Load pet
        pet = loadPet();
        if (pet) applyTimeDecay();

        if (!animFrame) render();
    }

    function closeGotchi() {
        const overlay = document.getElementById('gotchiOverlay');
        if (overlay) overlay.style.display = 'none';
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    }

    window.openGotchi = openGotchi;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGotchi);
    } else {
        initGotchi();
    }
})();
