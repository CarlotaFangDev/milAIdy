// milAIdy Wallet Integration - Jupiter Plugin Swap
(function() {
    var MILAIDY_MINT = '8rf5GN4MVPp7HFy3bjYqeqMpBAh2hJZ8fUSg2JV9BAGS';
    var SOL_MINT = 'So11111111111111111111111111111111111111112';

    function initWallet() {
        var buyBtn = document.getElementById('walletBuy');
        if (buyBtn) buyBtn.addEventListener('click', openJupiterSwap);
    }

    function openJupiterSwap() {
        if (!window.Jupiter) {
            alert('Jupiter Plugin is loading, please try again in a moment.');
            return;
        }

        window.Jupiter.init({
            displayMode: 'modal',
            formProps: {
                initialInputMint: SOL_MINT,
                initialOutputMint: MILAIDY_MINT,
                fixedMint: MILAIDY_MINT
            },
            onSuccess: function(data) {
                console.log('[milAIdy] Swap success:', data.txid);
            },
            onSwapError: function(data) {
                console.error('[milAIdy] Swap error:', data.error);
            }
        });
    }

    window.initWallet = initWallet;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWallet);
    } else {
        initWallet();
    }
})();
