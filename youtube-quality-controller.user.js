// ==UserScript==
// @name         YouTube Auto Quality Controller
// @namespace    https://github.com/OG-Owen/YouTube-Auto-Quality-Controller
// @version      1.0.0
// @description  Automatically sets YouTube video quality to match monitor resolution or force highest quality available
// @author       OG Owen
// @match        https://*.youtube.com/*
// @match        https://youtube.com/*
// @icon         https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/Icon.png
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @license      MIT
// @homepageURL  https://github.com/OG-Owen/YouTube-Auto-Quality-Controller
// @supportURL   https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/issues
// @downloadURL  https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/youtube-quality-controller.user.js
// @updateURL    https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/main/youtube-quality-controller.user.js
// ==/UserScript==

(function() {
    'use strict';

    // YouTube Auto Quality Controller by OG Owen
    // Automatically manages video quality based on your screen resolution

    // ========== CONSTANTS ==========
    var DEBOUNCE_DELAY = 3000;
    var MAX_RETRIES = 10;
    var RETRY_DELAY = 1000;
    var NAVIGATION_DELAY = 2000;
    var VIDEO_LOAD_DELAY = 500;

    var QUALITY_MAP = {
        'tiny': 144,
        'small': 240,
        'medium': 360,
        'large': 480,
        'hd720': 720,
        'hd1080': 1080,
        'hd1440': 1440,
        'hd2160': 2160,
        'hd2880': 2880,
        'highres': 4320
    };

    var QUALITY_LABELS = {
        'hd2160': '4K (2160p)',
        'hd1440': '2K (1440p)',
        'hd1080': 'Full HD (1080p)',
        'hd720': 'HD (720p)',
        'large': 'SD (480p)',
        'medium': '360p',
        'small': '240p'
    };

    var QUALITY_OPTIONS = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small'];

    // ========== STATE ==========
    var state = {
        alwaysUseHighRes: GM_getValue('alwaysUseHighRes', false),
        defaultFallback: GM_getValue('defaultFallback', 'hd1080'),
        lastQualitySet: null,
        lastQualityTime: 0,
        lastUrl: location.href,
        menuCommands: [] // Track registered menu commands for updating
    };

    // ========== CORE FUNCTIONS ==========

    /**
     * Determines the target quality based on available qualities and settings
     */
    function determineTargetQuality(availableQualities, screenHeight) {
        if (state.alwaysUseHighRes) {
            return findHighestQuality(availableQualities);
        }
        return findBestMatchForScreen(availableQualities, screenHeight);
    }

    /**
     * Finds the highest available quality
     */
    function findHighestQuality(availableQualities) {
        var maxVal = 0;
        var highest = availableQualities[0];

        for (var i = 0; i < availableQualities.length; i++) {
            var quality = availableQualities[i];
            var value = QUALITY_MAP[quality] || 0;
            if (value > maxVal) {
                maxVal = value;
                highest = quality;
            }
        }
        return highest;
    }

    /**
     * Finds the best quality that matches screen resolution
     */
    function findBestMatchForScreen(availableQualities, screenHeight) {
        var bestQuality = null;
        var bestHeight = 0;

        for (var i = 0; i < availableQualities.length; i++) {
            var quality = availableQualities[i];
            var height = QUALITY_MAP[quality];

            if (height && height <= screenHeight && height > bestHeight) {
                bestHeight = height;
                bestQuality = quality;
            }
        }

        if (bestQuality) {
            return bestQuality;
        }

        // Fallback logic
        if (availableQualities.includes(state.defaultFallback)) {
            return state.defaultFallback;
        }

        return availableQualities[availableQualities.length - 1];
    }

    /**
     * Applies quality settings to the player
     */
    function applyQualityToPlayer(player, quality) {
        if (typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange(quality, quality);
        }

        if (typeof player.setPlaybackQuality === 'function') {
            player.setPlaybackQuality(quality);
        }
    }

    /**
     * Main function to set video quality
     */
    function setQuality() {
        try {
            var player = document.querySelector('.html5-video-player');
            var video = document.querySelector('video');

            if (!player || !video || typeof player.getAvailableQualityLevels !== 'function') {
                return false;
            }

            var availableQualities = player.getAvailableQualityLevels();

            if (!availableQualities || availableQualities.length === 0) {
                return false;
            }

            var targetQuality = determineTargetQuality(availableQualities, screen.height);

            applyQualityToPlayer(player, targetQuality);

            // Update state
            state.lastQualitySet = targetQuality;
            state.lastQualityTime = Date.now();

            return true;

        } catch (error) {
            return false;
        }
    }

    /**
     * Attempts to set quality with debouncing and retries
     */
    function attemptSetQuality(retries) {
        retries = retries || 0;

        // Debounce check
        var now = Date.now();
        if (state.lastQualitySet && (now - state.lastQualityTime) < DEBOUNCE_DELAY) {
            return;
        }

        var success = setQuality();

        if (!success && retries < MAX_RETRIES) {
            setTimeout(function() {
                attemptSetQuality(retries + 1);
            }, RETRY_DELAY);
        }
    }

    // ========== MENU SYSTEM ==========

    /**
     * Unregisters all existing menu commands
     */
    function unregisterMenuCommands() {
        for (var i = 0; i < state.menuCommands.length; i++) {
            GM_unregisterMenuCommand(state.menuCommands[i]);
        }
        state.menuCommands = [];
    }

    /**
     * Registers Tampermonkey menu commands
     */
    function registerMenuCommands() {
        // Clear existing menu commands first
        unregisterMenuCommands();

        // Toggle quality mode
        var toggleCommand = GM_registerMenuCommand(
            (state.alwaysUseHighRes ? '✅' : '☐') + ' Always Use Highest Quality',
            function() {
                state.alwaysUseHighRes = !state.alwaysUseHighRes;
                GM_setValue('alwaysUseHighRes', state.alwaysUseHighRes);
                registerMenuCommands(); // Update menu to show new state
                alert('Setting updated to: ' + (state.alwaysUseHighRes ? 'Always Highest Quality' : 'Match Screen Resolution') + '\n\nPlease reload the page for changes to take effect.');
            }
        );
        state.menuCommands.push(toggleCommand);

        // Fallback quality selector
        var qualityCommand = GM_registerMenuCommand('📊 Fallback Quality: ' + QUALITY_LABELS[state.defaultFallback], function() {
            var options = '';

            for (var i = 0; i < QUALITY_OPTIONS.length; i++) {
                var quality = QUALITY_OPTIONS[i];
                var selected = (quality === state.defaultFallback) ? '→ ' : '   ';
                options += selected + (i + 1) + '. ' + QUALITY_LABELS[quality] + '\n';
            }

            var choice = prompt(
                'Select default fallback quality:\n\n' + options + '\nEnter number (1-7):',
                QUALITY_OPTIONS.indexOf(state.defaultFallback) + 1
            );

            if (choice === null) return; // User cancelled

            var index = parseInt(choice) - 1;
            if (index >= 0 && index < QUALITY_OPTIONS.length) {
                state.defaultFallback = QUALITY_OPTIONS[index];
                GM_setValue('defaultFallback', state.defaultFallback);
                registerMenuCommands(); // Update menu to show new selection
                alert('Fallback quality set to: ' + QUALITY_LABELS[state.defaultFallback] + '\n\nPlease reload the page for changes to take effect.');
            } else {
                alert('Invalid selection. Please enter a number between 1 and 7.');
            }
        });
        state.menuCommands.push(qualityCommand);
    }

    // ========== EVENT LISTENERS ==========

    /**
     * Sets up all event listeners for quality changes
     */
    function setupEventListeners() {
        // Monitor URL changes (YouTube SPA navigation)
        var observer = new MutationObserver(function() {
            var currentUrl = location.href;
            if (currentUrl !== state.lastUrl) {
                state.lastUrl = currentUrl;
                if (currentUrl.includes('/watch')) {
                    setTimeout(attemptSetQuality, NAVIGATION_DELAY);
                }
            }
        });

        observer.observe(document, {
            subtree: true,
            childList: true
        });

        // YouTube navigation event
        document.addEventListener('yt-navigate-finish', function() {
            setTimeout(attemptSetQuality, NAVIGATION_DELAY);
        });

        // Video ready event
        document.addEventListener('loadeddata', function(event) {
            if (event.target.tagName === 'VIDEO') {
                setTimeout(attemptSetQuality, VIDEO_LOAD_DELAY);
            }
        }, true);
    }

    // ========== INITIALIZATION ==========

    /**
     * Initialize the script
     */
    function init() {
        registerMenuCommands();
        setupEventListeners();
        attemptSetQuality();
    }

    // Start the script
    init();

})();
