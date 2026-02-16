// milAIdy – Unified Wallet UI
// Single "Connect Wallet" button that auto-detects ETH and SOL providers
(function() {
    'use strict';

    var connectBtn, connectedDiv, addrEthSpan, addrSolSpan, disconnectBtn;

    function updateUI() {
        var ethAddr = window.ethWalletAddress ? window.ethWalletAddress() : null;
        var solAddr = window.solWalletAddress ? window.solWalletAddress() : null;
        var anyConnected = ethAddr || solAddr;

        if (!connectBtn) return;

        if (anyConnected) {
            connectBtn.style.display = 'none';
            connectedDiv.style.display = 'flex';

            if (ethAddr) {
                var shortEth = ethAddr.slice(0, 6) + '...' + ethAddr.slice(-4);
                addrEthSpan.textContent = shortEth;
                addrEthSpan.title = ethAddr;
                addrEthSpan.style.display = 'inline';
            } else {
                addrEthSpan.style.display = 'none';
                addrEthSpan.textContent = '';
            }

            if (solAddr) {
                var shortSol = solAddr.slice(0, 4) + '...' + solAddr.slice(-4);
                addrSolSpan.textContent = shortSol;
                addrSolSpan.title = solAddr;
                addrSolSpan.style.display = 'inline';
            } else {
                addrSolSpan.style.display = 'none';
                addrSolSpan.textContent = '';
            }
        } else {
            connectBtn.style.display = 'inline-block';
            connectedDiv.style.display = 'none';
            addrEthSpan.style.display = 'none';
            addrSolSpan.style.display = 'none';
        }
    }

    // Expose for wallet-eth.js / wallet-sol.js account change callbacks
    window.walletUpdateUI = updateUI;

    async function connectWallet() {
        var hasEth = !!window.ethereum;
        var hasSol = !!(window.solGetProvider && window.solGetProvider());

        if (!hasEth && !hasSol) {
            alert('No wallet detected.\n\nInstall MetaMask (ETH) or Phantom (SOL) to connect.');
            return;
        }

        // Connect available wallets
        if (hasEth && window.ethConnect) {
            await window.ethConnect();
        }
        if (hasSol && window.solConnect) {
            await window.solConnect();
        }

        updateUI();
    }

    function disconnectWallet() {
        if (window.ethDisconnect) window.ethDisconnect();
        if (window.solDisconnect) window.solDisconnect();
        updateUI();
    }

    async function autoReconnect() {
        var tasks = [];
        if (localStorage.getItem('ethWalletConnected') === 'true' && window.ethAutoReconnect) {
            tasks.push(window.ethAutoReconnect());
        }
        if (localStorage.getItem('solWalletConnected') === 'true' && window.solAutoReconnect) {
            tasks.push(window.solAutoReconnect());
        }
        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
        }
        updateUI();
    }

    function init() {
        connectBtn = document.getElementById('walletConnect');
        connectedDiv = document.getElementById('walletConnected');
        addrEthSpan = document.getElementById('walletAddrEth');
        addrSolSpan = document.getElementById('walletAddrSol');
        disconnectBtn = document.getElementById('walletDisconnect');

        if (!connectBtn) return;

        connectBtn.addEventListener('click', connectWallet);
        if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);

        // Auto-reconnect previously connected wallets
        autoReconnect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
