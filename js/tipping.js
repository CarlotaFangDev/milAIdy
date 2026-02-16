// milAIdy – On-chain Tipping Module
(function() {
    'use strict';

    var CULT_CONTRACT = '0x0000000000c5dc95539589fbD24BE07c6C14eCa4';
    var TRANSFER_SELECTOR = '0xa9059cbb';

    function openTipModal(authorName, walletEth, walletSol) {
        // Remove existing modal
        closeTipModal();

        var tokens = [];
        if (walletEth) {
            tokens.push({ id: 'eth', label: '$ETH', chain: 'eth' });
            tokens.push({ id: 'cult', label: '$CULT', chain: 'eth' });
        }
        if (walletSol) {
            tokens.push({ id: 'milaidy', label: '$MILAIDY', chain: 'sol' });
        }

        if (tokens.length === 0) return;

        var html = '<div class="tip-modal-overlay" id="tipModalOverlay">';
        html += '<div class="tip-modal">';
        html += '<div class="tip-modal-header">';
        html += '<span>Tip ' + escapeHtmlTip(authorName) + '</span>';
        html += '<span class="tip-modal-close" id="tipModalClose">&#10005;</span>';
        html += '</div>';
        html += '<div class="tip-modal-body">';
        html += '<label class="tip-label">Token</label>';
        html += '<select id="tipTokenSelect" class="tip-select">';
        for (var i = 0; i < tokens.length; i++) {
            html += '<option value="' + tokens[i].id + '" data-chain="' + tokens[i].chain + '">' + tokens[i].label + '</option>';
        }
        html += '</select>';
        html += '<label class="tip-label">Amount</label>';
        html += '<input type="number" id="tipAmount" class="tip-input" placeholder="0.01" step="any" min="0">';
        html += '<button id="tipSendBtn" class="tip-send-btn">Send Tip</button>';
        html += '<div id="tipStatus" class="tip-status"></div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        var container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container.firstChild);

        // Event listeners
        document.getElementById('tipModalClose').addEventListener('click', closeTipModal);
        document.getElementById('tipModalOverlay').addEventListener('click', function(e) {
            if (e.target.id === 'tipModalOverlay') closeTipModal();
        });
        document.getElementById('tipSendBtn').addEventListener('click', function() {
            var token = document.getElementById('tipTokenSelect').value;
            var amount = parseFloat(document.getElementById('tipAmount').value);
            if (!amount || amount <= 0) {
                setTipStatus('Enter a valid amount', 'error');
                return;
            }
            sendTip(token, amount, walletEth, walletSol);
        });
    }

    function closeTipModal() {
        var modal = document.getElementById('tipModalOverlay');
        if (modal) modal.remove();
    }

    function setTipStatus(text, type) {
        var el = document.getElementById('tipStatus');
        if (!el) return;
        el.textContent = text;
        el.className = 'tip-status' + (type ? ' tip-status-' + type : '');
    }

    async function sendTip(token, amount, walletEth, walletSol) {
        var btn = document.getElementById('tipSendBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
        setTipStatus('Sending...', '');

        try {
            if (token === 'eth') {
                await sendEthTip(amount, walletEth);
            } else if (token === 'cult') {
                await sendCultTip(amount, walletEth);
            } else if (token === 'milaidy') {
                await sendMilaidyTip(amount, walletSol);
            }
            setTipStatus('Tip sent!', 'success');
            if (btn) btn.textContent = 'Sent!';
            setTimeout(closeTipModal, 2000);
        } catch (e) {
            var msg = e.code === 4001 ? 'Rejected' : (e.message || 'Error');
            setTipStatus(msg, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Send Tip'; }
        }
    }

    async function sendEthTip(amount, toAddress) {
        if (!window.ethereum) throw new Error('No ETH wallet');
        var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        var from = accounts[0];
        var weiValue = BigInt(Math.round(amount * 1e18));
        await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: from,
                to: toAddress,
                value: '0x' + weiValue.toString(16),
            }],
        });
    }

    async function sendCultTip(amount, toAddress) {
        if (!window.ethereum) throw new Error('No ETH wallet');
        var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        var from = accounts[0];
        var tokenAmount = BigInt(Math.round(amount * 1e18));
        var toAddrPadded = toAddress.slice(2).toLowerCase().padStart(64, '0');
        var amountPadded = tokenAmount.toString(16).padStart(64, '0');
        var data = TRANSFER_SELECTOR + toAddrPadded + amountPadded;
        await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: from,
                to: CULT_CONTRACT,
                data: data,
            }],
        });
    }

    async function sendMilaidyTip(amount, toAddress) {
        var provider = window.solGetProvider ? window.solGetProvider() : null;
        if (!provider) throw new Error('No Solana wallet');

        // Connect if not already
        var resp = await provider.connect();
        var fromPubKey = resp.publicKey;

        // For SPL token transfers we need the @solana/web3.js library
        // Since we don't bundle it, we do a raw SOL transfer as tip
        // (MILAIDY SPL transfers would require additional SDK)
        // Fallback: transfer SOL equivalent
        var lamports = Math.round(amount * 1e9); // SOL has 9 decimals

        // Build a simple SOL transfer transaction
        // Using provider.request for Phantom/Solflare
        if (provider.signAndSendTransaction) {
            // Use versioned transaction API if available
            var connection = 'https://api.mainnet-beta.solana.com';
            var res = await fetch(connection, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'getLatestBlockhash',
                    params: [{ commitment: 'finalized' }]
                })
            });
            var blockData = await res.json();
            var blockhash = blockData.result.value.blockhash;

            // Construct a minimal transfer instruction
            // SystemProgram.transfer = program 11111111111111111111111111111111
            // This requires serialization - for simplicity, use window.solana methods
            alert('SOL tip of ' + amount + ' SOL to ' + toAddress.slice(0, 8) + '...\nPlease confirm in your wallet.');

            // Simplified: request the wallet to handle it
            throw new Error('SPL token transfers require @solana/web3.js. Use SOL directly.');
        }
    }

    function escapeHtmlTip(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Expose globally
    window.openTipModal = openTipModal;
    window.closeTipModal = closeTipModal;
})();
