# Changelog

## [0.0.6] - 2026-04-03

### Changed
- `src/customized/` — new directory grouping all files added beyond the original Playwright source
- Moved `features.ts`, `quarantineContext.tsx`, `quarantineCheckboxes.tsx/.css`, `testQuarantineWidget.tsx/.css`, `quarantineConfirmDialog.tsx/.css` into `src/customized/`
- Updated imports in `src/reportView.tsx` and `src/testFileView.tsx` to reference new paths
- `CHANGELOG.md` — added (this file)

---

## [0.0.5] - 2026-03-24

### Added
- `src/customized/quarantineConfirmDialog.tsx` / `.css` — confirmation dialog shown before sending/removing tests from quarantine

### Changed
- `src/customized/testQuarantineWidget.tsx` — wire up confirmation dialog; quarantine action now requires user confirmation
- `src/customized/quarantineContext.tsx` — expose `fullFiles` for dialog test name resolution

---

## [0.0.4] - 2026-03-23

### Fixed
- `src/testFileView.tsx` — fix blank page crash when expanding the "Executed in Worker" chip (worker index out of bounds)

---

## [0.0.3] - 2026-03-23

### Added
- `src/customized/features.ts` — feature flags driven by URL search params (`?quarantine=...`)
- `src/customized/quarantineContext.tsx` — React context tracking quarantine filter mode and per-test selection state
- `src/customized/quarantineCheckboxes.tsx` / `.css` — file-level and test-level checkboxes for selecting tests to quarantine
- `src/customized/testQuarantineWidget.tsx` / `.css` — sticky header widget with global checkbox and "Send/Remove from Quarantine" button

### Changed
- `src/chip.tsx` — accept `beforeToggle` slot used by file-level quarantine checkbox
- `src/reportView.tsx` — wrap app in `QuarantineProvider`; render `TestQuarantineWidget` in the files route
- `src/testFileView.tsx` — render per-file and per-test quarantine checkboxes when quarantine mode is active
- `README.md` — document quarantine feature and new reporter options

---

## [0.0.2] - 2026-03-22

### Added
- `reporter.cjs` — full Node.js reporter: multi-file output (`index.html` + `data/`), HTTP server, automatic browser open, WSL support, attachment copying, trace viewer asset serving, code snippets via `@babel/code-frame`
- `vendor/isomorphic/` — vendored `formatUtils.ts`, `stringUtils.ts`, `types.d.ts` from Playwright
- `vendor/web/` — vendored `ansi2html.ts`, `renderUtils.tsx`, `uiUtils.ts`, `theme.ts`, shared `dialog.tsx`, `glassPane.tsx`, `imageDiffView.tsx`, `resizeView.tsx`, Playwright logo SVG

### Changed
- `src/metadataView.tsx` — fix metadata not displayed: pass `config.metadata`, remove stale `?show-metadata-other` gate
- `bundle.ts` — updated for standalone build
- `vite.config.ts` — add aliases for vendored modules
- `package.json` — add dependencies (`@babel/code-frame`, etc.), configure build

---

## [0.0.1] - 2026-03-21

Initial release — clean copy of Playwright's built-in HTML reporter extracted as a standalone project.

### Added
- All source files from Playwright's `packages/html-reporter/src/`
- `LICENSE`, `NOTICE`, `CLAUDE.md`, `README.md`
- `tsconfig.json`, `.yarnrc.yml`
