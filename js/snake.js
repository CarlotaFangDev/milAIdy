// milAIdy Snake Game (Nokia Edition)
// Imageboard-themed snake game in a popup overlay

(function() {
    const GRID = 15;
    const CELL = 20;
    const SIZE = GRID * CELL; // 300x300
    const FPS = 8;

    let canvas, ctx, game;
    let highScore = parseInt(localStorage.getItem('milaidySnakeHigh')) || 0;

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
        ctx.fillStyle = '#ffffee';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.fillStyle = '#800000';
        ctx.font = 'bold 20px arial';
        ctx.textAlign = 'center';
        ctx.fillText('SNAKE', SIZE/2, SIZE/2 - 30);
        ctx.font = '12px arial';
        ctx.fillText('Press START or SPACE', SIZE/2, SIZE/2 + 10);
        ctx.fillText('Arrow keys / WASD to move', SIZE/2, SIZE/2 + 30);
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
            placeFood();
        } else {
            game.snake.pop();
        }

        draw();
    }

    function draw() {
        // Background
        ctx.fillStyle = '#ffffee';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Grid lines (subtle)
        ctx.strokeStyle = '#f0e0d6';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL, 0);
            ctx.lineTo(i * CELL, SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL);
            ctx.lineTo(SIZE, i * CELL);
            ctx.stroke();
        }

        // Food
        if (game.food) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(game.food.x * CELL + 2, game.food.y * CELL + 2, CELL - 4, CELL - 4);
        }

        // Snake
        game.snake.forEach((seg, i) => {
            ctx.fillStyle = i === 0 ? '#800000' : '#789922';
            ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
        });
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
        ctx.font = 'bold 20px arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', SIZE/2, SIZE/2 - 10);
        ctx.font = '14px arial';
        ctx.fillText('Score: ' + game.score, SIZE/2, SIZE/2 + 20);
        ctx.font = '11px arial';
        ctx.fillText('Press START to retry', SIZE/2, SIZE/2 + 45);
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
