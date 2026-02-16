// milAIdy ETH - Ethereum Wallet Integration (EIP-1193)
// Core logic only – UI managed by wallet.js
(function() {
    'use strict';

    var DONATION_ADDRESS = '0x5Ef14041F096Ae738456e1df4b83Db733729615E';
    var CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    var TRANSFER_SELECTOR = '0xa9059cbb';

    var connectedAddress = null;

    function toHex(value) {
        return BigInt(value).toString(16);
    }

    function padHex(hex) {
        return hex.padStart(64, '0');
    }

    async function connectWallet() {
        if (!window.ethereum) {
            return null;
        }
        try {
            var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                connectedAddress = accounts[0];
                localStorage.setItem('ethWalletConnected', 'true');
                return connectedAddress;
            }
        } catch (e) {
            console.error('[milAIdy ETH] Wallet connect error:', e);
        }
        return null;
    }

    async function autoReconnect() {
        if (!window.ethereum) return null;
        try {
            var accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                connectedAddress = accounts[0];
                return connectedAddress;
            } else {
                localStorage.removeItem('ethWalletConnected');
            }
        } catch (e) {
            localStorage.removeItem('ethWalletConnected');
        }
        return null;
    }

    function disconnectWallet() {
        connectedAddress = null;
        localStorage.removeItem('ethWalletConnected');
    }

    function getAddress() {
        return connectedAddress;
    }

    async function donateEth(amount) {
        if (!connectedAddress) throw new Error('Not connected');
        if (!amount || amount <= 0) throw new Error('Invalid amount');

        var weiValue = BigInt(Math.round(amount * 1e18));
        var txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: connectedAddress,
                to: DONATION_ADDRESS,
                value: '0x' + toHex(weiValue.toString()),
            }],
        });
        return txHash;
    }

    async function donateCult(amount) {
        if (!connectedAddress) throw new Error('Not connected');
        if (!amount || amount <= 0) throw new Error('Invalid amount');

        var tokenAmount = BigInt(Math.round(amount * 1e18));
        var toAddrPadded = padHex(DONATION_ADDRESS.slice(2).toLowerCase());
        var amountPadded = padHex(toHex(tokenAmount.toString()));
        var data = TRANSFER_SELECTOR + toAddrPadded + amountPadded;

        var txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: connectedAddress,
                to: CULT_CONTRACT,
                data: data,
            }],
        });
        return txHash;
    }

    function buyCult() {
        window.open('https://app.uniswap.org/swap?outputCurrency=0x0000000000c5dc95539589fbD24BE07c6C14eCa4', '_blank');
    }

    // Listen for account changes
    if (window.ethereum && window.ethereum.on) {
        window.ethereum.on('accountsChanged', function(accounts) {
            if (accounts.length === 0) {
                disconnectWallet();
                if (window.walletUpdateUI) window.walletUpdateUI();
            } else {
                connectedAddress = accounts[0];
                if (window.walletUpdateUI) window.walletUpdateUI();
            }
        });
    }

    // Expose core functions
    window.ethConnect = connectWallet;
    window.ethAutoReconnect = autoReconnect;
    window.ethDisconnect = disconnectWallet;
    window.ethWalletAddress = getAddress;
    window.ethDonateEth = donateEth;
    window.ethDonateCult = donateCult;
    window.ethBuyCult = buyCult;

    // Backwards compat
    window.initWalletEth = function() {};
})();
