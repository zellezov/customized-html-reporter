# customized-html-reporter

A customized standalone version of Playwright's built-in HTML test reporter.

## License Compliance

This project is a derivative work of Playwright's HTML reporter, licensed under Apache 2.0.
**All changes must comply with the Apache 2.0 license requirements.**

### Rules for every change

1. **Retain copyright headers.** Never remove the `Copyright (c) Microsoft Corporation` header from
   any file that originally had one (all files in `src/` and `vendor/`). If you create a new file,
   add an Apache 2.0 header with both the original copyright and your own:
   ```
   /**
    * Copyright (c) Microsoft Corporation.
    * Modifications Copyright (c) <year> <your name/org>.
    *
    * Licensed under the Apache License, Version 2.0 (the "License");
    * ...
    */
   ```

2. **Mark modified files.** When you modify a file that was copied from Playwright source
   (`src/` files, or any file in `vendor/`), add a comment near the top of the file — after
   the license header but before the first import — describing what was changed. For example:
   ```
   // Modified from Playwright source: <describe the change briefly>
   ```
   This is a hard requirement of the Apache 2.0 license (section 4b): *"you must cause any
   modified files to carry prominent notices stating that You changed the files."* Do not
   skip this even for small changes.

3. **Keep NOTICE up to date.** If you add a new third-party library or vendor new files from
   Playwright or another Apache-licensed project, add an attribution entry to `NOTICE`.

4. **Do not relicense.** Do not change the license of this project or any included file to
   anything other than Apache 2.0.

5. **Vendored files.** Files under `vendor/` are copied verbatim from Playwright source.
   If you update a vendored file to a newer Playwright version, replace it entirely rather
   than patching, to keep attribution clean. If you modify a vendored file for project needs,
   move the modified version to `src/` and update the vite alias, leaving the original in
   `vendor/` for reference, or add the modification notice inline.

## Project Structure

```
src/         - Reporter UI source (React components), originally from Playwright
vendor/      - Vendored upstream source files (copied verbatim from Playwright)
  web/       - From packages/web/src in the Playwright monorepo
  isomorphic/- From packages/playwright-core/src/utils/isomorphic in Playwright
dist/        - Build output (index.html - the self-contained reporter web app)
```

## Build

```bash
yarn install
yarn build   # produces dist/index.html
```

## Using the built reporter

The build produces `dist/index.html` — a self-contained single-file web app.
To use it instead of Playwright's built-in HTML reporter, configure Playwright to use
the `html` reporter and replace the `index.html` inside Playwright's package with this one,
or implement a custom reporter that serves this file.
