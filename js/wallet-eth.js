// milAIdy ETH Maxi - Ethereum Wallet Integration (EIP-1193)
(function() {
    const DONATION_ADDRESS = '0x5Ef14041F096Ae738456e1df4b83Db733729615E';
    const CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    const TRANSFER_SELECTOR = '0xa9059cbb';

    let connectedAddress = null;
    let initialized = false;

    function initWalletEth() {
        if (initialized) return;
        initialized = true;

        // Try auto-reconnect
        if (localStorage.getItem('ethWalletConnected') === 'true') {
            autoReconnect();
        }

        document.getElementById('ethWalletConnect')?.addEventListener('click', connectWallet);
        document.getElementById('ethWalletDisconnect')?.addEventListener('click', disconnectWallet);
        document.getElementById('ethWalletDonateEth')?.addEventListener('click', donateEth);
        document.getElementById('ethWalletDonateCult')?.addEventListener('click', donateCult);
        document.getElementById('ethWalletBuyCult')?.addEventListener('click', buyCult);

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (!window.ETH_MAXI_MODE) return;
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    connectedAddress = accounts[0];
                    showConnectedState();
                }
            });
        }
    }

    async function autoReconnect() {
        if (!window.ethereum) return;
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                connectedAddress = accounts[0];
                showConnectedState();
            } else {
                localStorage.removeItem('ethWalletConnected');
            }
        } catch (e) {
            localStorage.removeItem('ethWalletConnected');
        }
    }

    async function connectWallet() {
        if (!window.ethereum) {
            window.open('https://ethereum.org/en/wallets/', '_blank');
            alert('Install an Ethereum wallet (MetaMask, Rainbow, Zerion, etc.)');
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                connectedAddress = accounts[0];
                localStorage.setItem('ethWalletConnected', 'true');
                showConnectedState();
            }
        } catch (e) {
            console.error('[milAIdy ETH] Wallet connect error:', e);
        }
    }

    function disconnectWallet() {
        connectedAddress = null;
        localStorage.removeItem('ethWalletConnected');
        showDisconnectedState();
    }

    function showConnectedState() {
        const short = connectedAddress.slice(0, 6) + '...' + connectedAddress.slice(-4);
        const connectBtn = document.getElementById('ethWalletConnect');
        const connectedDiv = document.getElementById('ethWalletConnected');
        const addrSpan = document.getElementById('ethWalletAddr');
        if (connectBtn) connectBtn.style.display = 'none';
        if (connectedDiv) connectedDiv.style.display = 'block';
        if (addrSpan) { addrSpan.textContent = short; addrSpan.title = connectedAddress; }
    }

    function showDisconnectedState() {
        const connectBtn = document.getElementById('ethWalletConnect');
        const connectedDiv = document.getElementById('ethWalletConnected');
        const addrSpan = document.getElementById('ethWalletAddr');
        if (connectBtn) connectBtn.style.display = 'inline-block';
        if (connectedDiv) connectedDiv.style.display = 'none';
        if (addrSpan) addrSpan.textContent = '';
    }

    function toHex(value) {
        return BigInt(value).toString(16);
    }

    function padHex(hex) {
        return hex.padStart(64, '0');
    }

    async function donateEth() {
        if (!connectedAddress) { alert('Connect wallet first'); return; }

        const input = document.getElementById('ethWalletEthAmount');
        const amount = parseFloat(input?.value);
        if (!amount || amount <= 0) { alert('Enter a valid ETH amount'); return; }

        const btn = document.getElementById('ethWalletDonateEth');
        const originalText = btn.textContent;
        btn.textContent = 'Sending...';
        btn.disabled = true;

        try {
            const weiValue = BigInt(Math.round(amount * 1e18));
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: connectedAddress,
                    to: DONATION_ADDRESS,
                    value: '0x' + toHex(weiValue.toString()),
                }],
            });

            btn.textContent = 'Sent!';
            console.log('[milAIdy ETH] Donate ETH TX:', txHash);

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                input.value = '';
            }, 3000);
        } catch (e) {
            console.error('[milAIdy ETH] Donate ETH error:', e);
            btn.textContent = e.code === 4001 ? 'Rejected' : 'Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }

    async function donateCult() {
        if (!connectedAddress) { alert('Connect wallet first'); return; }

        const input = document.getElementById('ethWalletCultAmount');
        const amount = parseFloat(input?.value);
        if (!amount || amount <= 0) { alert('Enter a valid CULT amount'); return; }

        const btn = document.getElementById('ethWalletDonateCult');
        const originalText = btn.textContent;
        btn.textContent = 'Sending...';
        btn.disabled = true;

        try {
            const tokenAmount = BigInt(Math.round(amount * 1e18));
            const toAddrPadded = padHex(DONATION_ADDRESS.slice(2).toLowerCase());
            const amountPadded = padHex(toHex(tokenAmount.toString()));
            const data = TRANSFER_SELECTOR + toAddrPadded + amountPadded;

            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: connectedAddress,
                    to: CULT_CONTRACT,
                    data: data,
                }],
            });

            btn.textContent = 'Sent!';
            console.log('[milAIdy ETH] Donate CULT TX:', txHash);

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                input.value = '';
            }, 3000);
        } catch (e) {
            console.error('[milAIdy ETH] Donate CULT error:', e);
            btn.textContent = e.code === 4001 ? 'Rejected' : 'Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }

    function buyCult() {
        window.open('https://app.uniswap.org/swap?outputCurrency=0x0000000000c5dc95539589fbD24BE07c6C14eCa4', '_blank');
    }

    // Expose for toggle activation
    window.initWalletEth = initWalletEth;
})();
