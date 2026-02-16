// milAIdy – Shared Price Ticker Module
// Fetches CULT, ETH, SOL, MILAIDY, PLTR prices for both index.html and blog.html
(function() {
    'use strict';

    var MILAIDY_SOL_MINT = '8rf5gn4mvpp7hfy3bjyqeqmpbah2hjz8fusg2jv9bags';
    var CULT_PAIR = '0xc4ce8e63921b8b6cbdb8fcb6bd64cc701fb926f2';
    var REFRESH_INTERVAL = 60000; // 60s
    var API_BASE = (typeof window !== 'undefined' && window.location)
        ? window.location.origin.replace(':3000', ':8080') : '';

    // Proxy-first fetchers (avoid adblockers)
    function fetchDex(path) {
        return fetch('/_api/dex/' + path)
            .then(function(r) {
                if (r.ok && (r.headers.get('content-type') || '').includes('json')) return r;
                throw new Error('proxy fail');
            })
            .catch(function() {
                return fetch('https://api.dexscreener.com/' + path).catch(function() { return null; });
            });
    }

    function fetchCG(path) {
        return fetch('/_api/cg/' + path)
            .then(function(r) {
                if (r.ok && (r.headers.get('content-type') || '').includes('json')) return r;
                throw new Error('proxy fail');
            })
            .catch(function() {
                return fetch('https://api.coingecko.com/' + path).catch(function() { return null; });
            });
    }

    function fetchYF(symbol) {
        return fetch('/_api/yf/v8/finance/chart/' + symbol + '?range=1d&interval=1d')
            .then(function(r) {
                if (r.ok && (r.headers.get('content-type') || '').includes('json')) return r;
                throw new Error('proxy fail');
            })
            .catch(function() {
                return fetch(API_BASE + '/api/proxy/stock/' + symbol)
                    .then(function(r) {
                        if (r.ok && (r.headers.get('content-type') || '').includes('json')) return r;
                        throw new Error('backend proxy fail');
                    })
                    .catch(function() {
                        return fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?range=1d&interval=1d')
                            .catch(function() { return null; });
                    });
            });
    }

    // Format price display
    function formatPrice(price) {
        if (price < 0.00001) return '$' + price.toExponential(2);
        if (price < 0.01)    return '$' + price.toFixed(6);
        if (price < 1)       return '$' + price.toFixed(4);
        return '$' + price.toFixed(2);
    }

    function formatChange(change) {
        return (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
    }

    function updateEl(priceId, changeId, price, change) {
        // Update all elements with matching data-ticker attribute (originals + clones)
        var priceEls = document.querySelectorAll('[data-ticker="' + priceId + '"]');
        var changeEls = document.querySelectorAll('[data-ticker="' + changeId + '"]');
        var priceText = formatPrice(price);
        var changeText = formatChange(change);
        var changeClass = 'ticker-change ' + (change >= 0 ? 'positive' : 'negative');
        for (var i = 0; i < priceEls.length; i++) {
            priceEls[i].textContent = priceText;
        }
        for (var j = 0; j < changeEls.length; j++) {
            changeEls[j].textContent = changeText;
            changeEls[j].className = changeClass;
        }
    }

    async function fetchAllPrices() {
        try {
            var results = await Promise.allSettled([
                // CULT (DexScreener)
                fetchDex('latest/dex/pairs/ethereum/' + CULT_PAIR),
                // ETH + SOL (CoinGecko)
                fetchCG('api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd&include_24hr_change=true'),
                // MILAIDY SOL (DexScreener by token)
                fetchDex('latest/dex/tokens/' + MILAIDY_SOL_MINT),
                // PLTR (Yahoo Finance proxy)
                fetchYF('PLTR')
            ]);

            // CULT
            if (results[0].status === 'fulfilled' && results[0].value && results[0].value.ok) {
                var cultData = await results[0].value.json();
                if (cultData.pair) {
                    var cp = parseFloat(cultData.pair.priceUsd) || 0;
                    var cc = parseFloat(cultData.pair.priceChange && cultData.pair.priceChange.h24) || 0;
                    updateEl('cultPrice', 'cultChange', cp, cc);
                }
            }

            // ETH + SOL
            if (results[1].status === 'fulfilled' && results[1].value && results[1].value.ok) {
                var cgData = await results[1].value.json();
                if (cgData.ethereum) {
                    updateEl('ethPrice', 'ethChange',
                        cgData.ethereum.usd || 0,
                        cgData.ethereum.usd_24h_change || 0);
                }
                if (cgData.solana) {
                    updateEl('solPrice', 'solChange',
                        cgData.solana.usd || 0,
                        cgData.solana.usd_24h_change || 0);
                }
            }

            // MILAIDY SOL
            if (results[2].status === 'fulfilled' && results[2].value && results[2].value.ok) {
                var milData = await results[2].value.json();
                if (milData.pairs && milData.pairs.length > 0) {
                    var pair = milData.pairs[0];
                    var mp = parseFloat(pair.priceUsd) || 0;
                    var mc = parseFloat(pair.priceChange && pair.priceChange.h24) || 0;
                    updateEl('milaidyPrice', 'milaidyChange', mp, mc);
                }
            }

            // PLTR
            if (results[3].status === 'fulfilled' && results[3].value && results[3].value.ok) {
                try {
                    var yfData = await results[3].value.json();
                    var chart = yfData.chart && yfData.chart.result && yfData.chart.result[0];
                    if (chart) {
                        var meta = chart.meta;
                        var pltrPrice = meta.regularMarketPrice || 0;
                        var prevClose = meta.chartPreviousClose || meta.previousClose || pltrPrice;
                        var pltrChange = prevClose > 0 ? ((pltrPrice - prevClose) / prevClose) * 100 : 0;
                        updateEl('pltrPrice', 'pltrChange', pltrPrice, pltrChange);
                    }
                } catch (e) { /* PLTR parse error */ }
            }
        } catch (e) {
            // Silent fail – tickers just show '--'
        }
    }

    // Clone ticker-content for seamless marquee loop (only if content overflows)
    function cloneTickerContent() {
        var track = document.querySelector('.ticker-track');
        var content = document.querySelector('.ticker-content');
        if (!track || !content) return;

        var existingClone = track.querySelector('.ticker-content + .ticker-content');

        if (content.scrollWidth > track.clientWidth) {
            // Content overflows — need clone for seamless marquee
            if (!existingClone) {
                var clone = content.cloneNode(true);
                track.appendChild(clone);
            }
            content.style.animation = '';
        } else {
            // Content fits — remove clone and disable animation
            if (existingClone) {
                track.removeChild(existingClone);
            }
            content.style.animation = 'none';
        }
    }

    // Auto-init when DOM ready
    function init() {
        cloneTickerContent();
        window.addEventListener('resize', cloneTickerContent);
        fetchAllPrices();
        setInterval(fetchAllPrices, REFRESH_INTERVAL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.fetchAllPrices = fetchAllPrices;
})();
