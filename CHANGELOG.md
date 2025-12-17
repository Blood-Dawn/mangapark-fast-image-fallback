# Changelog

All notable changes to this project will be documented in this file.

## [4.0.0] - 2025-12-17

### Added

- Fast CDN host pre-swap to reduce “stuck” images before requests fully kick off.
- Error-based retry loop with bounded attempts (prevents infinite reload loops).
- Watchdog for images that hang without firing `error` (reduces “needs click to load” cases).
- Auto-update metadata (`@updateURL` + `@downloadURL`) and a separate `.meta.js`.
- Domain coverage for `mangapark.*`, `comicpark.*`, `readpark.*`, `parkmanga.*` (including subdomains).

### Changed

- Set `@run-at document-start` to patch URLs as early as possible.

### Fixed

- Chapters/pages that would not render until manual interaction (click/scroll) in some cases.
