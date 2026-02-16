// milAIdy – Solana Wallet Integration
// Supports: Phantom, Solflare, Backpack, Brave, Rabby, and any EIP-compatible Solana provider
// Core logic only – UI managed by wallet.js
(function() {
    'use strict';

    var SOL_RPC_LIST = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-rpc.publicnode.com',
        'https://rpc.ankr.com/solana'
    ];
    var currentRpcIndex = 0;
    var TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    var ASSOC_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

    var connectedAddress = null;

    function getSolRpc() {
        return SOL_RPC_LIST[currentRpcIndex] || SOL_RPC_LIST[0];
    }

    function rotateSolRpc() {
        currentRpcIndex = (currentRpcIndex + 1) % SOL_RPC_LIST.length;
        console.log('[milAIdy SOL] Switching RPC to:', getSolRpc());
    }

    async function getConnectionWithBlockhash() {
        var SW = window.solanaWeb3;
        if (!SW) throw new Error('Solana SDK not loaded — refresh the page');
        for (var attempt = 0; attempt < SOL_RPC_LIST.length; attempt++) {
            try {
                var conn = new SW.Connection(getSolRpc(), 'confirmed');
                var bh = await conn.getLatestBlockhash();
                return { connection: conn, blockhash: bh.blockhash };
            } catch (e) {
                console.warn('[milAIdy SOL] RPC failed (' + getSolRpc() + '):', e.message);
                rotateSolRpc();
            }
        }
        throw new Error('All Solana RPC endpoints unavailable. Please try again in a moment.');
    }

    function getProvider() {
        // Phantom (most popular)
        if (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) {
            return window.phantom.solana;
        }
        // Solflare
        if (window.solflare && window.solflare.isSolflare) {
            return window.solflare;
        }
        // Backpack
        if (window.backpack && window.backpack.isBackpack) {
            return window.backpack;
        }
        // Brave built-in Solana wallet
        if (window.braveSolana) {
            return window.braveSolana;
        }
        // xNFT / Backpack embedded
        if (window.xnft && window.xnft.solana) {
            return window.xnft.solana;
        }
        // Generic window.solana (Phantom legacy, other wallets)
        if (window.solana) {
            return window.solana;
        }
        return null;
    }

    async function connectWallet() {
        var provider = getProvider();
        if (!provider) return null;
        try {
            var resp = await provider.connect();
            if (resp && resp.publicKey) {
                connectedAddress = resp.publicKey.toString();
                localStorage.setItem('solWalletConnected', 'true');
                return connectedAddress;
            }
        } catch (e) {
            console.error('[milAIdy SOL] Wallet connect error:', e);
        }
        return null;
    }

    async function autoReconnect() {
        var provider = getProvider();
        if (!provider) return null;
        try {
            var resp = await provider.connect({ onlyIfTrusted: true });
            if (resp && resp.publicKey) {
                connectedAddress = resp.publicKey.toString();
                return connectedAddress;
            } else {
                localStorage.removeItem('solWalletConnected');
            }
        } catch (e) {
            localStorage.removeItem('solWalletConnected');
        }
        return null;
    }

    function disconnectWallet() {
        var provider = getProvider();
        if (provider && provider.disconnect) {
            try { provider.disconnect(); } catch (e) {}
        }
        connectedAddress = null;
        localStorage.removeItem('solWalletConnected');
    }

    function getAddress() {
        return connectedAddress;
    }

    // Sign a message (for auth)
    async function signMessage(message) {
        var provider = getProvider();
        if (!provider) throw new Error('No Solana wallet');
        var encoded = new TextEncoder().encode(message);
        var signed = await provider.signMessage(encoded, 'utf8');
        var sigBytes = signed.signature || signed;
        var sigArray = Array.from(new Uint8Array(sigBytes));
        return sigArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    // ===== SOL Transfer (native) =====
    async function sendSol(amount, toAddress) {
        var SW = window.solanaWeb3;
        if (!SW) throw new Error('Solana SDK not loaded — refresh the page');
        var provider = getProvider();
        if (!provider || !provider.publicKey) throw new Error('Connect a Solana wallet first');

        var rpc = await getConnectionWithBlockhash();
        var from = provider.publicKey;
        var to = new SW.PublicKey(toAddress);
        var lamports = Math.round(amount * SW.LAMPORTS_PER_SOL);

        var tx = new SW.Transaction().add(
            SW.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: lamports })
        );
        tx.feePayer = from;
        tx.recentBlockhash = rpc.blockhash;
        return await signAndSend(provider, tx, rpc.connection);
    }

    // ===== SPL Token Transfer =====
    async function sendSplToken(amount, toAddress, mintAddress, decimals) {
        var SW = window.solanaWeb3;
        if (!SW) throw new Error('Solana SDK not loaded — refresh the page');
        var provider = getProvider();
        if (!provider || !provider.publicKey) throw new Error('Connect a Solana wallet first');

        var rpc = await getConnectionWithBlockhash();
        var from = provider.publicKey;
        var to = new SW.PublicKey(toAddress);
        var mint = new SW.PublicKey(mintAddress);
        var tokenPid = new SW.PublicKey(TOKEN_PROGRAM);
        var assocPid = new SW.PublicKey(ASSOC_TOKEN_PROGRAM);

        // Derive Associated Token Accounts
        var senderATA = (await SW.PublicKey.findProgramAddress(
            [from.toBuffer(), tokenPid.toBuffer(), mint.toBuffer()], assocPid
        ))[0];
        var receiverATA = (await SW.PublicKey.findProgramAddress(
            [to.toBuffer(), tokenPid.toBuffer(), mint.toBuffer()], assocPid
        ))[0];

        var tx = new SW.Transaction();

        // Create receiver ATA if it doesn't exist (idempotent)
        tx.add(new SW.TransactionInstruction({
            programId: assocPid,
            keys: [
                { pubkey: from, isSigner: true, isWritable: true },
                { pubkey: receiverATA, isSigner: false, isWritable: true },
                { pubkey: to, isSigner: false, isWritable: false },
                { pubkey: mint, isSigner: false, isWritable: false },
                { pubkey: SW.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: tokenPid, isSigner: false, isWritable: false },
            ],
            data: new Uint8Array([1]) // CreateIdempotent
        }));

        // SPL Transfer instruction (type 3)
        var rawAmt = BigInt(Math.round(amount * Math.pow(10, decimals)));
        var transferData = new Uint8Array(9);
        transferData[0] = 3;
        var a = rawAmt;
        for (var i = 0; i < 8; i++) { transferData[1 + i] = Number(a & 0xFFn); a >>= 8n; }

        tx.add(new SW.TransactionInstruction({
            programId: tokenPid,
            keys: [
                { pubkey: senderATA, isSigner: false, isWritable: true },
                { pubkey: receiverATA, isSigner: false, isWritable: true },
                { pubkey: from, isSigner: true, isWritable: false },
            ],
            data: transferData
        }));

        tx.feePayer = from;
        tx.recentBlockhash = rpc.blockhash;
        return await signAndSend(provider, tx, rpc.connection);
    }

    // Sign & send with fallback for different provider APIs
    async function signAndSend(provider, tx, connection) {
        try {
            // Phantom, Solflare, Backpack — standard method
            var result = await provider.signAndSendTransaction(tx);
            return result.signature || result;
        } catch (e) {
            // Fallback: sign locally, broadcast via RPC
            var signed = await provider.signTransaction(tx);
            return await connection.sendRawTransaction(signed.serialize());
        }
    }

    // Account change listener
    var provider = getProvider();
    if (provider && provider.on) {
        provider.on('accountChanged', function(pubKey) {
            if (pubKey) {
                connectedAddress = pubKey.toString();
                if (window.walletUpdateUI) window.walletUpdateUI();
            } else {
                disconnectWallet();
                if (window.walletUpdateUI) window.walletUpdateUI();
            }
        });
    }

    // Expose core functions
    window.solConnect = connectWallet;
    window.solAutoReconnect = autoReconnect;
    window.solDisconnect = disconnectWallet;
    window.solWalletAddress = getAddress;
    window.solSignMessage = signMessage;
    window.solGetProvider = getProvider;
    window.solSendSol = sendSol;
    window.solSendSplToken = sendSplToken;

    window.initWalletSol = function() {};
})();
