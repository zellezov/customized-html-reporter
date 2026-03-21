# customized-html-reporter

A customized standalone HTML test reporter for [Playwright](https://playwright.dev), derived
from Playwright's built-in HTML reporter.

## Requirements

- Node.js 18+
- Yarn (via [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)

## Build

```bash
yarn install
yarn build        # produces dist/index.html
```

## Usage

### Option A — installed as an npm package

```bash
npm install customized-html-reporter
# or
yarn add customized-html-reporter
```

```ts
export default defineConfig({
  reporter: [
    ['line'],
    ['customized-html-reporter', { outputFolder: 'playwright-report' }]
  ],
});
```

### Option B — local path (development / monorepo)

Point your `playwright.config.ts` directly at `reporter.cjs`:

```ts
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  reporter: [
    ['line'],
    [path.resolve(__dirname, '../customized-html-reporter/reporter.cjs'), { outputFolder: 'playwright-report' }]
  ],
});
```

### Option C — copy reporter.cjs into your project

Copy `reporter.cjs` into your own project and adjust the path to `dist/index.html` if needed.
The reporter and the frontend are loosely coupled through the JSON contract in `src/types.d.ts`,
so you can customise the reporter independently.

## How it works

1. `reporter.cjs` — Node.js Playwright reporter. Runs after tests, collects results, and
   produces a self-contained `index.html` by embedding the report data as a base64 ZIP inside
   the built frontend. Image attachments (screenshots, diffs) are inlined as base64 data URIs.

2. `dist/index.html` — the frontend, a single-file React app built from `src/`. Reads the
   embedded ZIP and renders the report entirely offline, with no server required.

## License

Apache 2.0. This project is a derivative work of the Playwright HTML reporter.
See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
