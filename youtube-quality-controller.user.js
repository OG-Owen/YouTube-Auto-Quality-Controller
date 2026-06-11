// ==UserScript==
// @name         YouTube Auto Quality Controller
// @namespace    https://github.com/OG-Owen/YouTube-Auto-Quality-Controller
// @version      2.2.0
// @description  Forces YouTube video quality to the highest available (or screen-matched) as soon as the player exists
// @author       OG Owen
// @match        https://*.youtube.com/*
// @match        https://youtube.com/*
// @icon         https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/Icon.png
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @noframes
// @license      MIT
// @homepageURL  https://github.com/OG-Owen/YouTube-Auto-Quality-Controller
// @supportURL   https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/issues
// @downloadURL  https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/youtube-quality-controller.user.js
// @updateURL    https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/youtube-quality-controller.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== CONSTANTS ==========
    const QUALITY_MAP = {
        'tiny': 144, 'small': 240, 'medium': 360, 'large': 480,
        'hd720': 720, 'hd1080': 1080, 'hd1440': 1440, 'hd2160': 2160,
        'hd2880': 2880, 'highres': 4320
    };

    const QUALITY_LABELS = {
        'hd2160': '4K (2160p)', 'hd1440': '2K (1440p)',
        'hd1080': 'Full HD (1080p)', 'hd720': 'HD (720p)',
        'large': 'SD (480p)', 'medium': '360p', 'small': '240p'
    };

    const QUALITY_OPTIONS = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small'];

    const ENFORCE_WINDOW_MS = 8000;
    const VERIFY_DELAY_MS = 500;
    const MAX_RETRIES = 10;

    // ========== STATE ==========
    const state = {
        alwaysUseHighRes: GM_getValue('alwaysUseHighRes', true),
        defaultFallback: GM_getValue('defaultFallback', 'hd1080'),
        enforceUntil: 0,
        retries: 0,
        retryTimer: null,
        hookedPlayer: null,
        pollTimer: null,
        menuCommands: []
    };

    // ========== QUALITY SELECTION ==========

    function findHighestQuality(qualities) {
        return qualities.reduce((best, q) =>
            (QUALITY_MAP[q] || 0) > (QUALITY_MAP[best] || 0) ? q : best
        , qualities[0]);
    }

    function findBestMatchForScreen(qualities, screenHeight) {
        let best = null, bestHeight = 0;
        for (const q of qualities) {
            const h = QUALITY_MAP[q];
            if (h && h <= screenHeight && h > bestHeight) {
                bestHeight = h;
                best = q;
            }
        }
        return best ||
            (qualities.includes(state.defaultFallback)
                ? state.defaultFallback
                : qualities[qualities.length - 1]);
    }

    function pickTarget(qualities) {
        return state.alwaysUseHighRes
            ? findHighestQuality(qualities)
            : findBestMatchForScreen(qualities, screen.height);
    }

    // ========== LOCALSTORAGE PRE-SEED ==========

    function preSeedStoredQuality() {
        try {
            const targetHeight = state.alwaysUseHighRes
                ? 4320
                : (QUALITY_MAP[state.defaultFallback] && screen.height >= QUALITY_MAP[state.defaultFallback]
                    ? screen.height
                    : QUALITY_MAP[state.defaultFallback] || 1080);

            const now = Date.now();
            const payload = {
                data: JSON.stringify({ quality: targetHeight, previousQuality: targetHeight }),
                expiration: now + 30 * 24 * 60 * 60 * 1000,
                creation: now
            };
            localStorage.setItem('yt-player-quality', JSON.stringify(payload));
        } catch (e) { /* localStorage blocked - API path still works */ }
    }

    // ========== API ENFORCEMENT ==========

    function getPlayer() {
        const p = document.getElementById('movie_player') ||
                  document.querySelector('.html5-video-player');
        return (p && typeof p.getAvailableQualityLevels === 'function') ? p : null;
    }

    function applyQuality(player) {
        const qualities = player.getAvailableQualityLevels?.();
        if (!qualities || !qualities.length) return false;

        const target = pickTarget(qualities);
        try {
            player.setPlaybackQualityRange?.(target, target);
            player.setPlaybackQuality?.(target);
        } catch (e) {
            return false;
        }
        return target;
    }

    function verifyAndRetry(player, target) {
        clearTimeout(state.retryTimer);
        state.retryTimer = setTimeout(() => {
            try {
                const current = player.getPlaybackQuality?.();
                const qualities = player.getAvailableQualityLevels?.() || [];
                const freshTarget = qualities.length ? pickTarget(qualities) : target;
                const done = current === freshTarget;
                const withinWindow = Date.now() < state.enforceUntil;

                if (!done && withinWindow && state.retries < MAX_RETRIES) {
                    state.retries++;
                    const applied = applyQuality(player);
                    if (applied) verifyAndRetry(player, applied);
                }
            } catch (e) { /* player torn down; navigation restarts us */ }
        }, VERIFY_DELAY_MS);
    }

    function enforceNow() {
        const player = getPlayer();
        if (!player) return false;

        hookPlayerEvents(player);
        const applied = applyQuality(player);
        if (applied) {
            verifyAndRetry(player, applied);
            return true;
        }
        return false;
    }

    function hookPlayerEvents(player) {
        if (state.hookedPlayer === player) return;
        state.hookedPlayer = player;
        try {
            player.addEventListener('onStateChange', (playerState) => {
                if ((playerState === 1 || playerState === 3) &&
                    Date.now() < state.enforceUntil) {
                    applyQuality(player);
                }
            });
        } catch (e) { /* verify/retry loop still covers us */ }
    }

    // ========== PER-VIDEO STARTUP ==========

    function startEnforcement() {
        state.enforceUntil = Date.now() + ENFORCE_WINDOW_MS;
        state.retries = 0;
        clearTimeout(state.retryTimer);
        clearInterval(state.pollTimer);

        if (enforceNow()) return;

        const started = Date.now();
        state.pollTimer = setInterval(() => {
            if (enforceNow() || Date.now() - started > ENFORCE_WINDOW_MS) {
                clearInterval(state.pollTimer);
                state.pollTimer = null;
            }
        }, 100);
    }

    function isWatchUrl(url) {
        return url.includes('/watch') || url.includes('/shorts/');
    }

    // ========== NAVIGATION ==========

    function setupNavigationDetection() {
        document.addEventListener('yt-navigate-finish', () => {
            if (isWatchUrl(location.href)) startEnforcement();
        });
        document.addEventListener('yt-player-updated', () => {
            if (isWatchUrl(location.href)) startEnforcement();
        });
    }

    // ========== MENU SYSTEM ==========
    // Layout (one click does everything, no prompts):
    //
    //   ✅ Mode: Always Highest Quality        <- click to toggle mode
    //   ── Fallback (used in screen-match mode):
    //   🔘 4K (2160p)                          <- click any to select it
    //   ⚪ 2K (1440p)
    //   ⚪ Full HD (1080p)
    //   ...

    function applySettingChange() {
        preSeedStoredQuality();
        registerMenuCommands();
        if (isWatchUrl(location.href)) startEnforcement(); // takes effect immediately
    }

    function registerMenuCommands() {
        state.menuCommands.forEach(id => {
            try { GM_unregisterMenuCommand(id); } catch (e) { /* ignore */ }
        });
        state.menuCommands = [];

        // --- Mode toggle ---
        const modeLabel = state.alwaysUseHighRes
            ? '✅ Mode: Always Highest Quality'
            : `🖥️ Mode: Match Screen (${screen.height}p)`;

        state.menuCommands.push(
            GM_registerMenuCommand(modeLabel, () => {
                state.alwaysUseHighRes = !state.alwaysUseHighRes;
                GM_setValue('alwaysUseHighRes', state.alwaysUseHighRes);
                applySettingChange();
            })
        );

        // --- Fallback quality: one command per option, current one marked ---
        for (const q of QUALITY_OPTIONS) {
            const selected = q === state.defaultFallback;
            const label = `${selected ? '🔘' : '⚪'} Fallback: ${QUALITY_LABELS[q]}`;

            state.menuCommands.push(
                GM_registerMenuCommand(label, () => {
                    state.defaultFallback = q;
                    GM_setValue('defaultFallback', q);
                    applySettingChange();
                })
            );
        }

        // --- Live status / info ---
        state.menuCommands.push(
            GM_registerMenuCommand('ℹ️ Status', () => {
                const player = getPlayer();
                let nowPlaying = 'no video open';
                let bestAvailable = '—';

                if (player) {
                    const q = player.getPlaybackQuality?.();
                    const list = player.getAvailableQualityLevels?.() || [];
                    nowPlaying = QUALITY_LABELS[q] || q || '—';
                    if (list.length) {
                        const top = findHighestQuality(list);
                        bestAvailable = QUALITY_LABELS[top] || top;
                    }
                }

                const mode = state.alwaysUseHighRes
                    ? 'Always Highest Quality'
                    : `Match Screen (${screen.height}p)`;

                alert(
                    `YouTube Auto Quality Controller v2.2.0\n\n` +
                    `Mode: ${mode}\n` +
                    `Fallback: ${QUALITY_LABELS[state.defaultFallback]}\n\n` +
                    `Current video: ${nowPlaying}\n` +
                    `Best available: ${bestAvailable}\n\n` +
                    `Report issues:\n` +
                    `https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/issues`
                );
            })
        );
    }

    // ========== INITIALIZATION ==========

    preSeedStoredQuality();
    registerMenuCommands();
    setupNavigationDetection();

    if (isWatchUrl(location.href)) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startEnforcement, { once: true });
        } else {
            startEnforcement();
        }
    }

})();
