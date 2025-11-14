// ==UserScript==
// @name         YouTube Auto Quality Controller
// @namespace    https://github.com/OG-Owen/YouTube-Auto-Quality-Controller
// @version      1.1.2
// @description  Sets YouTube video quality on start
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

(function() {
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

    // ========== STATE ==========
    const state = {
        alwaysUseHighRes: GM_getValue('alwaysUseHighRes', false),
        defaultFallback: GM_getValue('defaultFallback', 'hd1080'),
        currentUrl: location.href,
        hasSetQuality: false,
        activeObserver: null,
        menuCommands: []
    };

    // ========== CORE FUNCTIONS ==========

    function findHighestQuality(qualities) {
        return qualities.reduce((highest, q) =>
            (QUALITY_MAP[q] || 0) > (QUALITY_MAP[highest] || 0) ? q : highest
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
               (qualities.includes(state.defaultFallback) ? state.defaultFallback : qualities[qualities.length - 1]);
    }

    function setQualityOnce(player) {
        if (state.hasSetQuality) return;

        try {
            const qualities = player.getAvailableQualityLevels?.();
            if (!qualities?.length) return;

            const target = state.alwaysUseHighRes
                ? findHighestQuality(qualities)
                : findBestMatchForScreen(qualities, screen.height);

            player.setPlaybackQualityRange?.(target, target);
            player.setPlaybackQuality?.(target);

            state.hasSetQuality = true;

            // Clean up observer after successful quality set
            if (state.activeObserver) {
                state.activeObserver.disconnect();
                state.activeObserver = null;
            }
        } catch (e) {
            // Fail silently
        }
    }

    // ========== PASSIVE OBSERVER (NO BLOCKING) ==========

    function setupPassiveObserver() {
        // Clean up any existing observer
        if (state.activeObserver) {
            state.activeObserver.disconnect();
        }

        // Use MutationObserver but don't block - let video play immediately
        state.activeObserver = new MutationObserver(() => {
            if (state.hasSetQuality) {
                state.activeObserver?.disconnect();
                state.activeObserver = null;
                return;
            }

            const player = document.querySelector('.html5-video-player');
            if (player && typeof player.getAvailableQualityLevels === 'function') {
                const qualities = player.getAvailableQualityLevels();
                if (qualities?.length > 0) {
                    // Set quality asynchronously to not block rendering
                    requestAnimationFrame(() => setQualityOnce(player));
                }
            }
        });

        // Observe with minimal overhead
        if (document.body) {
            state.activeObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            const bodyWaiter = new MutationObserver(() => {
                if (document.body) {
                    bodyWaiter.disconnect();
                    state.activeObserver?.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
            });
            bodyWaiter.observe(document.documentElement, { childList: true });
        }

        // Single immediate check - non-blocking
        const checkExisting = () => {
            if (!state.hasSetQuality) {
                const player = document.querySelector('.html5-video-player');
                if (player) setQualityOnce(player);
            }
        };

        // Use requestIdleCallback with fallback for browsers that don't support it
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(checkExisting, { timeout: 100 });
        } else {
            setTimeout(checkExisting, 0);
        }
    }

    // ========== URL CHANGE DETECTION ==========

    function setupNavigationDetection() {
        const checkUrlChange = () => {
            const newUrl = location.href;
            if (newUrl !== state.currentUrl) {
                const isWatchPage = newUrl.includes('/watch');
                const wasWatchPage = state.currentUrl.includes('/watch');

                state.currentUrl = newUrl;

                // Only reset and observe if we're on a watch page
                if (isWatchPage) {
                    state.hasSetQuality = false;
                    setupPassiveObserver();
                } else if (wasWatchPage && !isWatchPage) {
                    // Clean up when leaving watch page
                    state.hasSetQuality = false;
                    if (state.activeObserver) {
                        state.activeObserver.disconnect();
                        state.activeObserver = null;
                    }
                }
            }
        };

        // YouTube SPA navigation
        document.addEventListener('yt-navigate-finish', checkUrlChange);

        // History API monitoring (wrapped to prevent errors)
        try {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function(...args) {
                originalPushState.apply(this, args);
                setTimeout(checkUrlChange, 0);
            };

            history.replaceState = function(...args) {
                originalReplaceState.apply(this, args);
                setTimeout(checkUrlChange, 0);
            };

            window.addEventListener('popstate', checkUrlChange);
        } catch (e) {
            // Fallback if history API patching fails
            console.warn('YouTube Quality Controller: Could not patch history API');
        }
    }

    // ========== MENU SYSTEM ==========

    function registerMenuCommands() {
        // Unregister old commands
        state.menuCommands.forEach(id => {
            try {
                GM_unregisterMenuCommand(id);
            } catch (e) {
                // Ignore errors from already unregistered commands
            }
        });
        state.menuCommands = [];

        // Toggle quality mode
        state.menuCommands.push(
            GM_registerMenuCommand(
                (state.alwaysUseHighRes ? '✅' : '☐') + ' Always Use Highest Quality',
                () => {
                    state.alwaysUseHighRes = !state.alwaysUseHighRes;
                    GM_setValue('alwaysUseHighRes', state.alwaysUseHighRes);

                    const mode = state.alwaysUseHighRes ? 'Always Highest Quality' : 'Match Screen Resolution';
                    const detail = state.alwaysUseHighRes
                        ? 'Videos will play at the highest available quality.'
                        : `Videos will match your screen resolution (${screen.height}p).`;

                    alert(`Quality Mode: ${mode}\n\n${detail}\n\nReload the page to apply changes.`);
                    registerMenuCommands();
                }
            )
        );

        // Fallback quality selector
        state.menuCommands.push(
            GM_registerMenuCommand(
                `📊 Fallback Quality: ${QUALITY_LABELS[state.defaultFallback]}`,
                () => {
                    const options = QUALITY_OPTIONS.map((q, i) =>
                        `${q === state.defaultFallback ? '→' : '   '} ${i + 1}. ${QUALITY_LABELS[q]}`
                    ).join('\n');

                    const currentIndex = QUALITY_OPTIONS.indexOf(state.defaultFallback) + 1;
                    const choice = prompt(
                        `Select fallback quality:\n(Used when no quality matches your screen)\n\n${options}\n\nEnter number (1-7):`,
                        currentIndex
                    );

                    if (choice === null) return;

                    const idx = parseInt(choice, 10) - 1;
                    if (idx >= 0 && idx < QUALITY_OPTIONS.length) {
                        state.defaultFallback = QUALITY_OPTIONS[idx];
                        GM_setValue('defaultFallback', state.defaultFallback);
                        alert(`Fallback Quality: ${QUALITY_LABELS[state.defaultFallback]}\n\nThis quality will be used when no available quality matches your screen resolution.\n\nReload the page to apply changes.`);
                        registerMenuCommands();
                    } else {
                        alert('Invalid selection. Please enter a number between 1 and 7.');
                    }
                }
            )
        );

        // Info/Help command
        state.menuCommands.push(
            GM_registerMenuCommand(
                'ℹ️ Script Info',
                () => {
                    const mode = state.alwaysUseHighRes ? 'Highest Quality' : 'Match Screen';
                    const screenRes = screen.height;
                    alert(
                        `YouTube Auto Quality Controller v2.3.0\n\n` +
                        `Current Settings:\n` +
                        `• Mode: ${mode}\n` +
                        `• Screen Resolution: ${screenRes}p\n` +
                        `• Fallback Quality: ${QUALITY_LABELS[state.defaultFallback]}\n\n` +
                        `Report issues:\n` +
                        `https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/issues`
                    );
                }
            )
        );
    }

    // ========== INITIALIZATION ==========

    registerMenuCommands();
    setupNavigationDetection();

    // Start passively observing on video pages
    if (location.href.includes('/watch')) {
        setupPassiveObserver();
    }

})();
