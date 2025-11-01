# YouTube Auto Quality Controller

A Tampermonkey userscript that automatically sets YouTube video quality to match your monitor's resolution or forces the highest quality available. No more manual adjustments!

## Features
- Matches video quality to your screen height (e.g., 1080p for Full HD monitors).
- Option to always force the highest quality (e.g., 4K if available).
- Configurable fallback quality via Tampermonkey menu.
- Debouncing and retries to handle YouTube's dynamic loading.
- Works on all YouTube pages (`https://*.youtube.com/*`).
  
## Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) extension for your browser (Chrome, Firefox, etc.).
2. Click [here](https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/raw/refs/heads/main/youtube-quality-controller.user.js) to install the script (or copy the raw URL into Tampermonkey's "Install from URL" feature).
3. Reload YouTube and enjoy automatic quality control!
4. If the script doesn't run (especially on Chrome-based browsers with Tampermonkey 5.3+), enable "Allow User Scripts" in the extension settings or turn on Developer Mode. For detailed steps:
  Desktop Chrome/Edge 138+: Right-click the Tampermonkey icon > "Manage Extension" > Enable "Allow User Scripts" toggle.
  General Desktop Chrome/Edge: Go to chrome://extensions or edge://extensions > Enable Developer Mode (top right).
  Microsoft Edge Android: Follow the visual guide in the FAQ.
  See [this](https://www.tampermonkey.net/faq.php#Q209) guide for more details and images.
   
## Configuration
- Access settings via Tampermonkey menu (right-click the extension icon > script name).
- Toggle "Always Use Highest Quality".
- Set fallback quality (default: 1080p).
  
## License
MIT License - see [LICENSE](LICENSE) for details.

## Support
Report issues or suggestions [here.](https://github.com/OG-Owen/YouTube-Auto-Quality-Controller/issues)
