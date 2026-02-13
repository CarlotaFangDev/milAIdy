// milAIdy Snake Game (Nokia Edition)
// Imageboard-themed snake game in a popup overlay

(function() {
    const GRID = 15;
    const CELL = 20;
    const SIZE = GRID * CELL; // 300x300
    const FPS = 10;

    let canvas, ctx, game;
    let highScore = parseInt(localStorage.getItem('milaidySnakeHigh')) || 0;
    let particles = [];

    function initSnakeGame() {
        const overlay = document.getElementById('snakeOverlay');
        if (!overlay) return;

        canvas = document.getElementById('snakeCanvas');
        ctx = canvas.getContext('2d');
        canvas.width = SIZE;
        canvas.height = SIZE;

        document.getElementById('snakeClose').addEventListener('click', closeSnake);
        document.getElementById('snakeStart').addEventListener('click', startGame);

        // Update high score display
        document.getElementById('snakeHigh').textContent = highScore;

        // Close on overlay background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSnake();
        });

        // Draw initial screen
        drawStartScreen();
    }

    function openSnake() {
        const overlay = document.getElementById('snakeOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            document.getElementById('snakeHigh').textContent = highScore;
            drawStartScreen();
        }
    }

    function closeSnake() {
        const overlay = document.getElementById('snakeOverlay');
        if (overlay) overlay.style.display = 'none';
        if (game && game.interval) {
            clearInterval(game.interval);
            game.interval = null;
        }
    }

    function drawStartScreen() {
        // Background
        ctx.fillStyle = '#ffffee';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Subtle checkerboard
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                if ((x + y) % 2 === 0) {
                    ctx.fillStyle = 'rgba(0,0,0,0.02)';
                    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
                }
            }
        }

        ctx.fillStyle = '#800000';
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SNAKE', SIZE/2, SIZE/2 - 30);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText('Press START', SIZE/2, SIZE/2 + 10);
        ctx.fillText('or SPACE', SIZE/2, SIZE/2 + 28);
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = '#999';
        ctx.fillText('Arrows / WASD', SIZE/2, SIZE/2 + 50);
    }

    function startGame() {
        game = {
            snake: [{ x: 7, y: 7 }],
            dir: { x: 1, y: 0 },
            nextDir: { x: 1, y: 0 },
            food: null,
            score: 0,
            paused: false,
            over: false,
            interval: null,
        };
        particles = [];
        placeFood();
        document.getElementById('snakeScore').textContent = '0';

        if (game.interval) clearInterval(game.interval);
        game.interval = setInterval(tick, 1000 / FPS);
    }

    function placeFood() {
        let pos;
        do {
            pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
        } while (game.snake.some(s => s.x === pos.x && s.y === pos.y));
        game.food = pos;
    }

    function spawnParticles(x, y) {
        const colors = ['#ff0000', '#ff4444', '#ff8800', '#ffcc00', '#ff6666', '#cc0000', '#44aa00', '#ffaaaa'];
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + (Math.random() - 0.5) * 0.5;
            const speed = 1.5 + Math.random() * 2;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 15 + Math.floor(Math.random() * 10),
                color: colors[i % colors.length],
                size: 2 + Math.random() * 2
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / 25);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size));
        }
        ctx.globalAlpha = 1;
    }

    function tick() {
        if (!game || game.paused || game.over) return;

        game.dir = { ...game.nextDir };
        const head = { x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y };

        // Wall collision
        if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
            gameOver();
            return;
        }

        // Self collision
        if (game.snake.some(s => s.x === head.x && s.y === head.y)) {
            gameOver();
            return;
        }

        game.snake.unshift(head);

        // Eat food
        if (game.food && head.x === game.food.x && head.y === game.food.y) {
            game.score++;
            document.getElementById('snakeScore').textContent = game.score;
            // Spawn particles at food position
            spawnParticles(
                game.food.x * CELL + CELL / 2,
                game.food.y * CELL + CELL / 2
            );
            placeFood();
        } else {
            game.snake.pop();
        }

        updateParticles();
        draw();
    }

    function draw() {
        // Background
        ctx.fillStyle = '#ffffee';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Checkerboard grid
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                if ((x + y) % 2 === 0) {
                    ctx.fillStyle = 'rgba(0,0,0,0.025)';
                    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
                }
            }
        }

        // Food - pixel apple
        if (game.food) {
            const fx = game.food.x * CELL + CELL / 2;
            const fy = game.food.y * CELL + CELL / 2;
            const r = CELL / 2 - 3;

            // Apple body (red circle with highlight)
            ctx.beginPath();
            ctx.arc(fx, fy + 1, r, 0, Math.PI * 2);
            ctx.fillStyle = '#dd2222';
            ctx.fill();

            // Highlight
            ctx.beginPath();
            ctx.arc(fx - 2, fy - 1, r * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fill();

            // Stem (brown)
            ctx.fillStyle = '#6b3a1f';
            ctx.fillRect(fx - 1, fy - r - 3, 2, 4);

            // Leaf (green)
            ctx.beginPath();
            ctx.ellipse(fx + 3, fy - r - 1, 3, 1.5, 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#44aa00';
            ctx.fill();
        }

        // Snake body (draw tail to head so head is on top)
        for (let i = game.snake.length - 1; i >= 0; i--) {
            const seg = game.snake[i];
            const cx = seg.x * CELL + CELL / 2;
            const cy = seg.y * CELL + CELL / 2;

            if (i === 0) {
                // HEAD: rounded circle with directional eyes
                ctx.beginPath();
                ctx.arc(cx, cy, CELL / 2 - 1, 0, Math.PI * 2);
                ctx.fillStyle = '#800000';
                ctx.fill();

                // Determine eye positions based on direction
                const dir = game.dir;
                let eye1x, eye1y, eye2x, eye2y;
                const eyeOffset = 4;
                const eyeForward = 3;

                if (dir.x === 1) { // right
                    eye1x = cx + eyeForward; eye1y = cy - eyeOffset;
                    eye2x = cx + eyeForward; eye2y = cy + eyeOffset;
                } else if (dir.x === -1) { // left
                    eye1x = cx - eyeForward; eye1y = cy - eyeOffset;
                    eye2x = cx - eyeForward; eye2y = cy + eyeOffset;
                } else if (dir.y === -1) { // up
                    eye1x = cx - eyeOffset; eye1y = cy - eyeForward;
                    eye2x = cx + eyeOffset; eye2y = cy - eyeForward;
                } else { // down
                    eye1x = cx - eyeOffset; eye1y = cy + eyeForward;
                    eye2x = cx + eyeOffset; eye2y = cy + eyeForward;
                }

                // White of eyes
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(eye1x, eye1y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(eye2x, eye2y, 3, 0, Math.PI * 2);
                ctx.fill();

                // Pupils (offset slightly in direction)
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(eye1x + dir.x * 1, eye1y + dir.y * 1, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(eye2x + dir.x * 1, eye2y + dir.y * 1, 1.5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // BODY: rounded rectangles with gradient that fades toward tail
                const t = i / game.snake.length; // 0 = near head, 1 = tail
                const r = Math.max(2, (CELL / 2 - 2) * (1 - t * 0.3)); // slightly smaller toward tail

                // Base color: interpolate from vibrant to muted toward tail
                const g1 = Math.floor(153 - t * 40); // green channel fades
                const g2 = Math.floor(34 + t * 20);
                ctx.fillStyle = `rgb(${g2}, ${g1}, ${g2})`;

                // Draw rounded rect
                const rx = cx - r;
                const ry = cy - r;
                const rw = r * 2;
                const rh = r * 2;
                const corner = Math.min(4, r * 0.5);

                ctx.beginPath();
                ctx.moveTo(rx + corner, ry);
                ctx.lineTo(rx + rw - corner, ry);
                ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + corner);
                ctx.lineTo(rx + rw, ry + rh - corner);
                ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - corner, ry + rh);
                ctx.lineTo(rx + corner, ry + rh);
                ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - corner);
                ctx.lineTo(rx, ry + corner);
                ctx.quadraticCurveTo(rx, ry, rx + corner, ry);
                ctx.closePath();
                ctx.fill();

                // Subtle highlight on top-left
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.beginPath();
                ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Particles on top
        drawParticles();
    }

    function gameOver() {
        game.over = true;
        if (game.interval) {
            clearInterval(game.interval);
            game.interval = null;
        }

        if (game.score > highScore) {
            highScore = game.score;
            localStorage.setItem('milaidySnakeHigh', highScore);
            document.getElementById('snakeHigh').textContent = highScore;
        }

        // Draw game over screen
        draw();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', SIZE/2, SIZE/2 - 10);
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText('Score: ' + game.score, SIZE/2, SIZE/2 + 20);
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText('Press START', SIZE/2, SIZE/2 + 45);
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('snakeOverlay');
        if (!overlay || overlay.style.display === 'none') return;
        if (!game) return;

        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (game.over) {
                startGame();
            } else {
                game.paused = !game.paused;
            }
            return;
        }

        if (game.over || game.paused) return;

        const keyMap = {
            'ArrowUp': { x: 0, y: -1 }, 'w': { x: 0, y: -1 }, 'W': { x: 0, y: -1 },
            'ArrowDown': { x: 0, y: 1 }, 's': { x: 0, y: 1 }, 'S': { x: 0, y: 1 },
            'ArrowLeft': { x: -1, y: 0 }, 'a': { x: -1, y: 0 }, 'A': { x: -1, y: 0 },
            'ArrowRight': { x: 1, y: 0 }, 'd': { x: 1, y: 0 }, 'D': { x: 1, y: 0 },
        };

        const newDir = keyMap[e.key];
        if (newDir) {
            e.preventDefault();
            // Prevent 180-degree turns
            if (newDir.x !== -game.dir.x || newDir.y !== -game.dir.y) {
                game.nextDir = newDir;
            }
        }
    });

    // Expose
    window.openSnake = openSnake;

    // Init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSnakeGame);
    } else {
        initSnakeGame();
    }
})();
