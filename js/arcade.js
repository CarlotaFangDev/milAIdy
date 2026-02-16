// milAIdy – Arcade Lobby
(function() {
    'use strict';

    var ALL_TOKENS = [
        { id: 'MILAIDY', label: 'MILAIDY' },
        { id: 'ETH', label: 'ETH' },
        { id: 'CULT', label: 'CULT' },
        { id: 'SOL', label: 'SOL' }
    ];

    var MASCOT_TIPS = [
        'Welcome. Deposit tokens to play for real, or try demo mode first!',
        'Plinko HARD mode has 50x at the edges... if you can reach them.',
        'Higher or Lower: know when to cash out!',
        'Connect both ETH and SOL wallets for full multi-chain access.',
        'Snake and Miladygotchi are free, no deposit needed.',
        'Try demo mode to learn the games before betting real tokens.',
        'Limbo tip: lower targets = higher win chance.'
    ];

    function openArcade() {
        var overlay = document.getElementById('arcadeOverlay');
        if (overlay) overlay.style.display = 'flex';
        buildLobby();
    }

    function getArcadeWallet() {
        var eth = window.ethWalletAddress ? window.ethWalletAddress() : null;
        if (eth) return eth;
        var sol = window.solWalletAddress ? window.solWalletAddress() : null;
        return sol || null;
    }

    function buildLobby() {
        // Mascot tip
        var bubble = document.getElementById('arcadeMascotBubble');
        if (bubble) bubble.textContent = MASCOT_TIPS[Math.floor(Math.random() * MASCOT_TIPS.length)];

        // Wallet connection status
        buildWalletStatus();

        // Balance rows
        buildBalances();
    }

    function buildWalletStatus() {
        var container = document.getElementById('arcadeWallets');
        if (!container) return;
        container.innerHTML = '';

        var ethAddr = window.ethWalletAddress ? window.ethWalletAddress() : null;
        var solAddr = window.solWalletAddress ? window.solWalletAddress() : null;

        // ETH row
        var ethRow = document.createElement('div');
        ethRow.className = 'arcade-wallet-row';
        var ethLabel = '<span class="arcade-wallet-label">ETH:</span> ';
        if (ethAddr) {
            ethRow.innerHTML = ethLabel + '<span class="arcade-wallet-addr">' + ethAddr.slice(0,6) + '...' + ethAddr.slice(-4) + '</span>';
        } else {
            ethRow.innerHTML = ethLabel;
            var ethLink = document.createElement('span');
            ethLink.className = 'arcade-wallet-connect';
            ethLink.textContent = '[connect MetaMask]';
            ethLink.addEventListener('click', function() {
                if (window.ethConnect) window.ethConnect().then(function() {
                    if (window.walletUpdateUI) window.walletUpdateUI();
                    buildLobby();
                });
            });
            ethRow.appendChild(ethLink);
        }
        container.appendChild(ethRow);

        // SOL row
        var solRow = document.createElement('div');
        solRow.className = 'arcade-wallet-row';
        var solLabel = '<span class="arcade-wallet-label">SOL:</span> ';
        if (solAddr) {
            solRow.innerHTML = solLabel + '<span class="arcade-wallet-addr">' + solAddr.slice(0,4) + '...' + solAddr.slice(-4) + '</span>';
        } else {
            solRow.innerHTML = solLabel;
            var solLink = document.createElement('span');
            solLink.className = 'arcade-wallet-connect';
            solLink.textContent = '[connect Phantom]';
            solLink.addEventListener('click', function() {
                if (window.solConnect) window.solConnect().then(function() {
                    if (window.walletUpdateUI) window.walletUpdateUI();
                    buildLobby();
                });
            });
            solRow.appendChild(solLink);
        }
        container.appendChild(solRow);
    }

    function buildBalances() {
        var container = document.getElementById('arcadeBalances');
        if (!container) return;
        container.innerHTML = '';

        ALL_TOKENS.forEach(function(t) {
            var row = document.createElement('div');
            row.className = 'arcade-token-row';
            row.innerHTML = '<span class="arcade-token-name">' + t.label + ':</span> ' +
                '<span class="arcade-token-amt" id="arcadeBal_' + t.id + '">0.00</span>';
            container.appendChild(row);
        });

        refreshBalances();
    }

    function refreshBalances() {
        if (!window.fetchArcadeBalance) return;

        var ethAddr = window.ethWalletAddress ? window.ethWalletAddress() : null;
        var solAddr = window.solWalletAddress ? window.solWalletAddress() : null;
        if (!ethAddr && !solAddr) return;

        // Reset all balances first
        ALL_TOKENS.forEach(function(t) {
            var el = document.getElementById('arcadeBal_' + t.id);
            if (el) el.textContent = '0.00';
        });

        // Collect balances from all connected wallets
        var merged = {};
        var promises = [];

        if (ethAddr) {
            promises.push(window.fetchArcadeBalance(ethAddr, null).then(function(balances) {
                if (balances && balances.length) {
                    balances.forEach(function(b) {
                        merged[b.token] = (merged[b.token] || 0) + b.amount;
                    });
                }
            }));
        }
        if (solAddr) {
            promises.push(window.fetchArcadeBalance(solAddr, null).then(function(balances) {
                if (balances && balances.length) {
                    balances.forEach(function(b) {
                        merged[b.token] = (merged[b.token] || 0) + b.amount;
                    });
                }
            }));
        }

        Promise.all(promises).then(function() {
            Object.keys(merged).forEach(function(token) {
                var el = document.getElementById('arcadeBal_' + token);
                if (el) el.textContent = formatBal(merged[token]);
            });
        });
    }

    function formatBal(n) {
        if (n === 0) return '0.00';
        if (n >= 1) return n.toFixed(2);
        if (n >= 0.001) return n.toFixed(4);
        return n.toFixed(6);
    }

    function closeArcade() {
        var overlay = document.getElementById('arcadeOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function launchGame(game) {
        closeArcade();
        switch (game) {
            case 'snake':  if (window.openSnake) window.openSnake(); break;
            case 'gotchi': if (window.openGotchi) window.openGotchi(); break;
            case 'plinko': if (window.openPlinko) window.openPlinko(); break;
            case 'highlow': if (window.openHighLow) window.openHighLow(); break;
            case 'limbo': if (window.openLimbo) window.openLimbo(); break;
        }
    }

    function init() {
        var closeBtn = document.getElementById('arcadeClose');
        if (closeBtn) closeBtn.addEventListener('click', closeArcade);

        var cards = document.querySelectorAll('.arcade-card');
        cards.forEach(function(card) {
            card.addEventListener('click', function() {
                var game = card.dataset.game;
                if (game) launchGame(game);
            });
        });

        var overlay = document.getElementById('arcadeOverlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) closeArcade();
            });
        }

        var depBtn = document.getElementById('arcadeDepositBtn');
        if (depBtn) {
            depBtn.addEventListener('click', function() {
                if (window.openDepositModal) {
                    window.openDepositModal(function() { refreshBalances(); });
                }
            });
        }

        var wdBtn = document.getElementById('arcadeWithdrawBtn');
        if (wdBtn) {
            wdBtn.addEventListener('click', function() {
                if (window.openWithdrawModal) {
                    window.openWithdrawModal(function() { refreshBalances(); });
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.openArcade = openArcade;
    window.closeArcade = closeArcade;
    window.refreshArcadeBalances = refreshBalances;
})();

// milAIdy – Arcade Deposit Modal & Balance Helpers
(function() {
    'use strict';

    var ETH_TREASURY = '0x5Ef14041F096Ae738456e1df4b83Db733729615E';
    var SOL_TREASURY = '31zqBuhGgGE6rGUNfMyF4NEncgJtdKxQ3kGaR12EGwcc';
    var CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    var TRANSFER_SEL = '0xa9059cbb';

    var API_BASE = window.location.origin.replace(':3000', ':8080');
    var activeCallback = null;

    // Always show all 4 tokens — mark unavailable ones
    var ALL_DEPOSIT_TOKENS = [
        { label: 'MILAIDY', value: 'MILAIDY',  chain: 'solana' },
        { label: 'ETH',     value: 'ETH',     chain: 'ethereum' },
        { label: 'CULT',    value: 'CULT',     chain: 'ethereum' },
        { label: 'SOL',     value: 'SOL',      chain: 'solana' }
    ];

    function getConnectedWallets() {
        var wallets = { eth: null, sol: null };
        wallets.eth = window.ethWalletAddress ? window.ethWalletAddress() : null;
        wallets.sol = window.solWalletAddress ? window.solWalletAddress() : null;
        return wallets;
    }

    function openDepositModal(callback) {
        closeDepositModal();
        activeCallback = callback || null;

        var wallets = getConnectedWallets();
        if (!wallets.eth && !wallets.sol) {
            alert('Connect a wallet first to deposit.');
            return;
        }

        // Build modal
        var overlay = document.createElement('div');
        overlay.className = 'deposit-modal-overlay';
        overlay.id = 'depositModalOverlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeDepositModal();
        });

        var modal = document.createElement('div');
        modal.className = 'deposit-modal';

        // Header
        var header = document.createElement('div');
        header.className = 'deposit-modal-header';
        header.innerHTML = '<span>DEPOSIT</span>';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u2715';
        closeBtn.addEventListener('click', closeDepositModal);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Body
        var body = document.createElement('div');
        body.className = 'deposit-modal-body';

        // Token select — show ALL tokens
        var tokenLabel = document.createElement('label');
        tokenLabel.className = 'deposit-label';
        tokenLabel.textContent = 'Token';
        body.appendChild(tokenLabel);

        var select = document.createElement('select');
        select.className = 'deposit-select';
        select.id = 'depositTokenSelect';
        ALL_DEPOSIT_TOKENS.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t.value;
            var available = (t.chain === 'ethereum' && wallets.eth) || (t.chain === 'solana' && wallets.sol);
            var hint = '';
            if (!available) {
                hint = t.chain === 'ethereum' ? ' (connect ETH wallet)' : ' (connect SOL wallet)';
            }
            opt.textContent = t.label + hint;
            opt.dataset.chain = t.chain;
            opt.disabled = !available;
            select.appendChild(opt);
        });
        // Select first available
        for (var i = 0; i < select.options.length; i++) {
            if (!select.options[i].disabled) { select.selectedIndex = i; break; }
        }
        body.appendChild(select);

        // Amount input
        var amtLabel = document.createElement('label');
        amtLabel.className = 'deposit-label';
        amtLabel.id = 'depositAmountLabel';
        amtLabel.textContent = 'Amount';
        body.appendChild(amtLabel);

        var input = document.createElement('input');
        input.className = 'deposit-input';
        input.id = 'depositAmountInput';
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.placeholder = '0.00';
        body.appendChild(input);

        // Update placeholder and label hint when token changes
        var updateAmountHint = function() {
            var lbl = document.getElementById('depositAmountLabel');
            if (select.value === 'MILAIDY') {
                input.placeholder = '1000';
                input.min = '1000';
                if (lbl) lbl.textContent = 'Amount (min 1,000)';
            } else {
                input.placeholder = '0.00';
                input.min = '0';
                if (lbl) lbl.textContent = 'Amount';
            }
        };
        select.addEventListener('change', updateAmountHint);
        updateAmountHint();

        // Send button
        var sendBtn = document.createElement('button');
        sendBtn.className = 'deposit-send-btn';
        sendBtn.id = 'depositSendBtn';
        sendBtn.textContent = 'SEND DEPOSIT';
        sendBtn.addEventListener('click', function() {
            var token = select.value;
            var chain = select.options[select.selectedIndex].dataset.chain;
            var amount = parseFloat(input.value);
            if (!amount || amount <= 0) {
                setDepositStatus('Enter a valid amount', true);
                return;
            }
            if (token === 'MILAIDY' && amount < 1000) {
                setDepositStatus('Minimum MILAIDY deposit is 1,000', true);
                return;
            }
            sendBtn.disabled = true;
            setDepositStatus('Sending transaction...', false);
            executeDeposit(token, amount, chain, wallets, activeCallback);
        });
        body.appendChild(sendBtn);

        // Status
        var status = document.createElement('div');
        status.className = 'deposit-status';
        status.id = 'depositStatus';
        body.appendChild(status);

        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function closeDepositModal() {
        var existing = document.getElementById('depositModalOverlay');
        if (existing) existing.remove();
        activeCallback = null;
    }

    function setDepositStatus(msg, isError) {
        var el = document.getElementById('depositStatus');
        if (!el) return;
        el.textContent = msg;
        el.className = 'deposit-status ' + (isError ? 'error' : 'success');
    }

    function enableSendBtn() {
        var btn = document.getElementById('depositSendBtn');
        if (btn) btn.disabled = false;
    }

    async function executeDeposit(token, amount, chain, wallets, callback) {
        try {
            var txHash = null;
            var wallet = null;

            if (chain === 'ethereum') {
                wallet = wallets.eth;
                if (!wallet || !window.ethereum) throw new Error('No ETH wallet');
                var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                wallet = accounts[0];

                if (token === 'ETH') {
                    txHash = await sendEthToTreasury(amount, wallet);
                } else if (token === 'CULT') {
                    txHash = await sendCultToTreasury(amount, wallet);
                }
            } else if (chain === 'solana') {
                wallet = wallets.sol;
                txHash = await sendSolToTreasury(amount, token);
            }

            if (!txHash) throw new Error('Transaction failed');

            setDepositStatus('Recording deposit...', false);
            var resp = await fetch(API_BASE + '/api/arcade/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: wallet,
                    tx_hash: txHash,
                    token: token,
                    amount: amount,
                    chain: chain
                })
            });
            var data = await resp.json();
            if (data.error) throw new Error(data.error);

            setDepositStatus('Deposit confirmed! Balance: ' + data.balance, false);

            if (callback) {
                setTimeout(function() {
                    callback(data.balance, token);
                    closeDepositModal();
                }, 1500);
            } else {
                setTimeout(closeDepositModal, 2000);
            }
        } catch (err) {
            var msg = err.code === 4001 ? 'Transaction rejected' : (err.message || 'Deposit failed');
            setDepositStatus(msg, true);
            enableSendBtn();
        }
    }

    async function sendEthToTreasury(amount, from) {
        var wei = BigInt(Math.round(amount * 1e18));
        var txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: from,
                to: ETH_TREASURY,
                value: '0x' + wei.toString(16)
            }]
        });
        return txHash;
    }

    async function sendCultToTreasury(amount, from) {
        var amt = BigInt(Math.round(amount * 1e18));
        var paddedAddr = ETH_TREASURY.slice(2).toLowerCase().padStart(64, '0');
        var paddedAmt = amt.toString(16).padStart(64, '0');
        var data = TRANSFER_SEL + paddedAddr + paddedAmt;
        var txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: from,
                to: CULT_CONTRACT,
                data: data
            }]
        });
        return txHash;
    }

    var MILAIDY_MINT = '8rf5GN4MVPp7HFy3bjYqeqMpBAh2hJZ8fUSg2JV9BAGS';
    var MILAIDY_DECIMALS = 9;

    async function sendSolToTreasury(amount, token) {
        if (token === 'SOL') {
            if (!window.solSendSol) throw new Error('Solana wallet not loaded');
            return await window.solSendSol(amount, SOL_TREASURY);
        } else if (token === 'MILAIDY') {
            if (!window.solSendSplToken) throw new Error('Solana wallet not loaded');
            return await window.solSendSplToken(amount, SOL_TREASURY, MILAIDY_MINT, MILAIDY_DECIMALS);
        }
        throw new Error('Unknown Solana token: ' + token);
    }

    async function fetchArcadeBalance(wallet, token) {
        try {
            var resp = await fetch(API_BASE + '/api/arcade/balance?wallet=' + encodeURIComponent(wallet));
            var data = await resp.json();
            if (data.balances) {
                if (token) {
                    var found = data.balances.find(function(b) { return b.token === token; });
                    return found ? found.amount : 0;
                }
                return data.balances;
            }
            return token ? 0 : [];
        } catch (e) {
            return token ? 0 : [];
        }
    }

    window.openDepositModal = openDepositModal;
    window.closeDepositModal = closeDepositModal;
    window.fetchArcadeBalance = fetchArcadeBalance;
})();

// milAIdy – Withdraw Modal (placeholder — debits balance, stays "pending review")
(function() {
    'use strict';

    var API_BASE = window.location.origin.replace(':3000', ':8080');
    var activeCallback = null;

    var ALL_TOKENS = [
        { label: 'MILAIDY', value: 'MILAIDY' },
        { label: 'ETH',     value: 'ETH' },
        { label: 'CULT',    value: 'CULT' },
        { label: 'SOL',     value: 'SOL' }
    ];

    function getWallets() {
        return {
            eth: window.ethWalletAddress ? window.ethWalletAddress() : null,
            sol: window.solWalletAddress ? window.solWalletAddress() : null
        };
    }

    function openWithdrawModal(callback) {
        closeWithdrawModal();
        activeCallback = callback || null;

        var wallets = getWallets();
        if (!wallets.eth && !wallets.sol) {
            alert('Connect a wallet first to withdraw.');
            return;
        }
        var wallet = wallets.eth || wallets.sol;

        // Build modal (reuse deposit-modal styles)
        var overlay = document.createElement('div');
        overlay.className = 'deposit-modal-overlay';
        overlay.id = 'withdrawModalOverlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeWithdrawModal();
        });

        var modal = document.createElement('div');
        modal.className = 'deposit-modal';

        // Header
        var header = document.createElement('div');
        header.className = 'deposit-modal-header';
        header.innerHTML = '<span>WITHDRAW</span>';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u2715';
        closeBtn.addEventListener('click', closeWithdrawModal);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Body
        var body = document.createElement('div');
        body.className = 'deposit-modal-body';

        // Token select
        var tokenLabel = document.createElement('label');
        tokenLabel.className = 'deposit-label';
        tokenLabel.textContent = 'Token';
        body.appendChild(tokenLabel);

        var select = document.createElement('select');
        select.className = 'deposit-select';
        select.id = 'withdrawTokenSelect';
        ALL_TOKENS.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t.value;
            opt.textContent = t.label;
            select.appendChild(opt);
        });
        body.appendChild(select);

        // Show current balance for selected token
        var balInfo = document.createElement('div');
        balInfo.className = 'deposit-status';
        balInfo.id = 'withdrawBalInfo';
        balInfo.textContent = 'Loading balance...';
        body.appendChild(balInfo);

        // Load balance on token change (aggregate both wallets)
        var loadBal = function() {
            var tk = select.value;
            if (!window.fetchArcadeBalance) return;
            var total = 0;
            var promises = [];
            if (wallets.eth) {
                promises.push(window.fetchArcadeBalance(wallets.eth, tk).then(function(amt) {
                    if (typeof amt === 'number') total += amt;
                }));
            }
            if (wallets.sol) {
                promises.push(window.fetchArcadeBalance(wallets.sol, tk).then(function(amt) {
                    if (typeof amt === 'number') total += amt;
                }));
            }
            Promise.all(promises).then(function() {
                balInfo.textContent = 'Available: ' + total.toFixed(4) + ' ' + tk;
            });
        };
        select.addEventListener('change', loadBal);
        loadBal();

        // Amount input
        var amtLabel = document.createElement('label');
        amtLabel.className = 'deposit-label';
        amtLabel.textContent = 'Amount';
        body.appendChild(amtLabel);

        var input = document.createElement('input');
        input.className = 'deposit-input';
        input.id = 'withdrawAmountInput';
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.placeholder = '0.00';
        body.appendChild(input);

        // Destination address
        var destLabel = document.createElement('label');
        destLabel.className = 'deposit-label';
        destLabel.textContent = 'Destination address';
        body.appendChild(destLabel);

        var destInput = document.createElement('input');
        destInput.className = 'deposit-input';
        destInput.id = 'withdrawDestInput';
        destInput.type = 'text';
        destInput.placeholder = wallet;
        destInput.value = wallet;
        body.appendChild(destInput);

        // Send button
        var sendBtn = document.createElement('button');
        sendBtn.className = 'deposit-send-btn';
        sendBtn.id = 'withdrawSendBtn';
        sendBtn.textContent = 'REQUEST WITHDRAWAL';
        sendBtn.addEventListener('click', function() {
            var token = select.value;
            var amount = parseFloat(input.value);
            var dest = destInput.value.trim();
            if (!amount || amount <= 0) {
                setWithdrawStatus('Enter a valid amount', true);
                return;
            }
            if (!dest) {
                setWithdrawStatus('Enter a destination address', true);
                return;
            }
            // Use the correct wallet for the token's chain
            var withdrawWallet = (token === 'SOL' || token === 'MILAIDY') ? (wallets.sol || wallets.eth) : (wallets.eth || wallets.sol);
            sendBtn.disabled = true;
            setWithdrawStatus('Submitting withdrawal...', false);
            executeWithdraw(withdrawWallet, token, amount, dest);
        });
        body.appendChild(sendBtn);

        // Status
        var status = document.createElement('div');
        status.className = 'deposit-status';
        status.id = 'withdrawStatus';
        body.appendChild(status);

        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function closeWithdrawModal() {
        var existing = document.getElementById('withdrawModalOverlay');
        if (existing) existing.remove();
        var cb = activeCallback;
        activeCallback = null;
        if (cb) cb();
    }

    function setWithdrawStatus(msg, isError) {
        var el = document.getElementById('withdrawStatus');
        if (!el) return;
        el.textContent = msg;
        el.className = 'deposit-status ' + (isError ? 'error' : 'success');
    }

    async function executeWithdraw(wallet, token, amount, destination) {
        try {
            var resp = await fetch(API_BASE + '/api/arcade/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: wallet,
                    token: token,
                    amount: amount,
                    destination: destination
                })
            });
            var data = await resp.json();
            if (data.error) throw new Error(data.error);

            setWithdrawStatus('Withdrawal submitted for review. Remaining: ' + (data.balance != null ? data.balance.toFixed(4) : '--') + ' ' + token, false);
            setTimeout(function() { closeWithdrawModal(); }, 3000);
        } catch (err) {
            setWithdrawStatus(err.message || 'Withdrawal failed', true);
            var btn = document.getElementById('withdrawSendBtn');
            if (btn) btn.disabled = false;
        }
    }

    window.openWithdrawModal = openWithdrawModal;
    window.closeWithdrawModal = closeWithdrawModal;
})();

// milAIdy – Donate Modal (pure on-chain donation to treasury)
(function() {
    'use strict';

    var ETH_TREASURY = '0x5Ef14041F096Ae738456e1df4b83Db733729615E';
    var SOL_TREASURY = '31zqBuhGgGE6rGUNfMyF4NEncgJtdKxQ3kGaR12EGwcc';
    var CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    var MILAIDY_MINT = '8rf5GN4MVPp7HFy3bjYqeqMpBAh2hJZ8fUSg2JV9BAGS';
    var MILAIDY_DECIMALS = 9;
    var TRANSFER_SEL = '0xa9059cbb';

    function getConnectedWallets() {
        var wallets = { eth: null, sol: null };
        wallets.eth = window.ethWalletAddress ? window.ethWalletAddress() : null;
        wallets.sol = window.solWalletAddress ? window.solWalletAddress() : null;
        return wallets;
    }

    function openDonateModal() {
        closeDonateModal();

        var wallets = getConnectedWallets();
        if (!wallets.eth && !wallets.sol) {
            alert('Connect a wallet to donate');
            return;
        }

        var tokens = [];
        if (wallets.sol) {
            tokens.push({ label: 'MILAIDY', value: 'MILAIDY', chain: 'solana' });
            tokens.push({ label: 'SOL', value: 'SOL', chain: 'solana' });
        }
        if (wallets.eth) {
            tokens.push({ label: 'ETH', value: 'ETH', chain: 'ethereum' });
            tokens.push({ label: 'CULT', value: 'CULT', chain: 'ethereum' });
        }

        var overlay = document.createElement('div');
        overlay.className = 'deposit-modal-overlay';
        overlay.id = 'donateModalOverlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeDonateModal();
        });

        var modal = document.createElement('div');
        modal.className = 'deposit-modal';

        var header = document.createElement('div');
        header.className = 'deposit-modal-header';
        header.innerHTML = '<span>DONATE</span>';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u2715';
        closeBtn.addEventListener('click', closeDonateModal);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        var body = document.createElement('div');
        body.className = 'deposit-modal-body';

        var tokenLabel = document.createElement('label');
        tokenLabel.className = 'deposit-label';
        tokenLabel.textContent = 'Token';
        body.appendChild(tokenLabel);

        var select = document.createElement('select');
        select.className = 'deposit-select';
        select.id = 'donateTokenSelect';
        tokens.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t.value;
            opt.textContent = t.label;
            opt.dataset.chain = t.chain;
            select.appendChild(opt);
        });
        body.appendChild(select);

        var amtLabel = document.createElement('label');
        amtLabel.className = 'deposit-label';
        amtLabel.textContent = 'Amount';
        body.appendChild(amtLabel);

        var input = document.createElement('input');
        input.className = 'deposit-input';
        input.id = 'donateAmountInput';
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.placeholder = '0.00';
        body.appendChild(input);

        var sendBtn = document.createElement('button');
        sendBtn.className = 'deposit-send-btn';
        sendBtn.id = 'donateSendBtn';
        sendBtn.textContent = 'SEND DONATION';
        sendBtn.addEventListener('click', function() {
            var token = select.value;
            var chain = select.options[select.selectedIndex].dataset.chain;
            var amount = parseFloat(input.value);
            if (!amount || amount <= 0) {
                setDonateStatus('Enter a valid amount', true);
                return;
            }
            if (token === 'MILAIDY' && amount < 1000) {
                setDonateStatus('Minimum MILAIDY amount is 1,000', true);
                return;
            }
            sendBtn.disabled = true;
            setDonateStatus('Sending transaction...', false);
            executeDonate(token, amount, chain, wallets);
        });
        body.appendChild(sendBtn);

        var status = document.createElement('div');
        status.className = 'deposit-status';
        status.id = 'donateStatus';
        body.appendChild(status);

        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function closeDonateModal() {
        var existing = document.getElementById('donateModalOverlay');
        if (existing) existing.remove();
    }

    function setDonateStatus(msg, isError) {
        var el = document.getElementById('donateStatus');
        if (!el) return;
        el.textContent = msg;
        el.className = 'deposit-status ' + (isError ? 'error' : 'success');
    }

    async function executeDonate(token, amount, chain, wallets) {
        try {
            var txHash = null;

            if (chain === 'ethereum') {
                var wallet = wallets.eth;
                if (!wallet || !window.ethereum) throw new Error('No ETH wallet');
                var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                wallet = accounts[0];

                if (token === 'ETH') {
                    var wei = BigInt(Math.round(amount * 1e18));
                    txHash = await window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{ from: wallet, to: ETH_TREASURY, value: '0x' + wei.toString(16) }]
                    });
                } else if (token === 'CULT') {
                    var amt = BigInt(Math.round(amount * 1e18));
                    var paddedAddr = ETH_TREASURY.slice(2).toLowerCase().padStart(64, '0');
                    var paddedAmt = amt.toString(16).padStart(64, '0');
                    var data = TRANSFER_SEL + paddedAddr + paddedAmt;
                    txHash = await window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{ from: wallet, to: CULT_CONTRACT, data: data }]
                    });
                }
            } else if (chain === 'solana') {
                if (token === 'SOL') {
                    if (!window.solSendSol) throw new Error('Solana wallet not loaded');
                    txHash = await window.solSendSol(amount, SOL_TREASURY);
                } else if (token === 'MILAIDY') {
                    if (!window.solSendSplToken) throw new Error('Solana wallet not loaded');
                    txHash = await window.solSendSplToken(amount, SOL_TREASURY, MILAIDY_MINT, MILAIDY_DECIMALS);
                }
            }

            if (!txHash) throw new Error('Transaction failed');
            var txShort = typeof txHash === 'string' ? txHash.slice(0, 10) + '...' : 'confirmed';
            setDonateStatus('Donation sent! TX: ' + txShort, false);
            setTimeout(closeDonateModal, 3000);
        } catch (err) {
            var msg = err.code === 4001 ? 'Transaction rejected' : (err.message || 'Donation failed');
            setDonateStatus(msg, true);
            var btn = document.getElementById('donateSendBtn');
            if (btn) btn.disabled = false;
        }
    }

    window.openDonateModal = openDonateModal;
})();
