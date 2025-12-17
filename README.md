# MangaPark Image Fallback (Fast + Watchdog)

Fixes common MangaPark image loading failures by switching CDN subdomains and retrying quickly.

## Install

1. Install Tampermonkey.
2. Open `dist/MangaPark-Image-Fallback.user.js` (raw view) and click Install.

## Updates

Auto-updates are supported via the script metadata (`@updateURL` + `@downloadURL`) and versioning.

## Support

Open an issue with:

- the MangaPark domain you used
- which CDN label was failing (example: s02)
- a screenshot of the Network error (403/404/timeout)
