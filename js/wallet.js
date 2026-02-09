// milAIdy Wallet Integration - Phantom + Jupiter Swap
(function() {
    const MILAIDY_MINT = '8rf5GN4MVPp7HFy3bjYqeqMpBAh2hJZ8fUSg2JV9BAGS';
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
    const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

    let connectedWallet = null;
    let walletPublicKey = null;

    function initWallet() {
        const widget = document.getElementById('solWalletWidget') || document.getElementById('walletWidget');
        if (!widget) return;

        // Try auto-reconnect
        if (localStorage.getItem('milaidyWalletConnected') === 'true') {
            autoReconnect();
        }

        document.getElementById('walletConnect')?.addEventListener('click', connectWallet);
        document.getElementById('walletDisconnect')?.addEventListener('click', disconnectWallet);
        document.getElementById('walletBuy')?.addEventListener('click', executeBuy);
    }

    async function autoReconnect() {
        if (!window.solana?.isPhantom) return;
        try {
            const resp = await window.solana.connect({ onlyIfTrusted: true });
            walletPublicKey = resp.publicKey;
            connectedWallet = window.solana;
            showConnectedState();
        } catch (e) {
            localStorage.removeItem('milaidyWalletConnected');
        }
    }

    async function connectWallet() {
        if (!window.solana?.isPhantom) {
            window.open('https://phantom.app/', '_blank');
            return;
        }

        try {
            const resp = await window.solana.connect();
            walletPublicKey = resp.publicKey;
            connectedWallet = window.solana;
            localStorage.setItem('milaidyWalletConnected', 'true');
            showConnectedState();
        } catch (e) {
            console.error('[milAIdy] Wallet connect error:', e);
        }
    }

    function disconnectWallet() {
        if (connectedWallet) {
            connectedWallet.disconnect();
        }
        connectedWallet = null;
        walletPublicKey = null;
        localStorage.removeItem('milaidyWalletConnected');
        showDisconnectedState();
    }

    function showConnectedState() {
        const addr = walletPublicKey.toString();
        const short = addr.slice(0, 4) + '...' + addr.slice(-4);

        document.getElementById('walletConnect').style.display = 'none';
        document.getElementById('walletConnected').style.display = 'block';
        document.getElementById('walletAddr').textContent = short;
        document.getElementById('walletAddr').title = addr;
    }

    function showDisconnectedState() {
        document.getElementById('walletConnect').style.display = 'inline-block';
        document.getElementById('walletConnected').style.display = 'none';
        document.getElementById('walletAddr').textContent = '';
    }

    async function executeBuy() {
        if (!connectedWallet || !walletPublicKey) {
            alert('Connect wallet first');
            return;
        }

        const solInput = document.getElementById('walletSolAmount');
        const solAmount = parseFloat(solInput?.value);
        if (!solAmount || solAmount <= 0) {
            alert('Enter a valid SOL amount');
            return;
        }

        const lamports = Math.floor(solAmount * 1e9);
        const buyBtn = document.getElementById('walletBuy');
        const originalText = buyBtn.textContent;
        buyBtn.textContent = 'Getting quote...';
        buyBtn.disabled = true;

        try {
            // Get quote from Jupiter
            const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${SOL_MINT}&outputMint=${MILAIDY_MINT}&amount=${lamports}&slippageBps=100`;
            const quoteRes = await fetch(quoteUrl);
            if (!quoteRes.ok) throw new Error('Failed to get quote');
            const quoteData = await quoteRes.json();

            buyBtn.textContent = 'Signing...';

            // Get swap transaction
            const swapRes = await fetch(JUPITER_SWAP_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: quoteData,
                    userPublicKey: walletPublicKey.toString(),
                    wrapAndUnwrapSol: true,
                })
            });
            if (!swapRes.ok) throw new Error('Failed to build swap transaction');
            const swapData = await swapRes.json();

            // Deserialize and sign
            const swapTransactionBuf = Uint8Array.from(atob(swapData.swapTransaction), c => c.charCodeAt(0));
            const transaction = solanaWeb3.VersionedTransaction.deserialize(swapTransactionBuf);

            const signed = await connectedWallet.signTransaction(transaction);

            buyBtn.textContent = 'Sending...';

            // Send transaction
            const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
            const txid = await connection.sendRawTransaction(signed.serialize(), {
                skipPreflight: true,
                maxRetries: 2,
            });

            buyBtn.textContent = 'Sent!';
            console.log('[milAIdy] Swap TX:', txid);

            setTimeout(() => {
                buyBtn.textContent = originalText;
                buyBtn.disabled = false;
                solInput.value = '';
            }, 3000);

        } catch (e) {
            console.error('[milAIdy] Swap error:', e);
            buyBtn.textContent = e.message || 'Error';
            setTimeout(() => {
                buyBtn.textContent = originalText;
                buyBtn.disabled = false;
            }, 2000);
        }
    }

    // Expose
    window.initWallet = initWallet;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWallet);
    } else {
        initWallet();
    }
})();
