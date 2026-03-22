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

Copy `reporter.cjs` and `dist/index.html` into your own project and update the
`REPORTER_INDEX_HTML` path at the top of `reporter.cjs` to point to the copied `index.html`.

## Reporter options

| Option | Env var | Default | Description |
|--------|---------|---------|-------------|
| `outputFolder` | `PLAYWRIGHT_HTML_OUTPUT_DIR` | `playwright-report` | Report output directory |
| `open` | `PLAYWRIGHT_HTML_OPEN` | `on-failure` | When to auto-open: `always`, `on-failure`, `never` |
| `host` | `PLAYWRIGHT_HTML_HOST` | `localhost` | HTTP server host |
| `port` | `PLAYWRIGHT_HTML_PORT` | `9323` (or OS-assigned) | HTTP server port |
| `attachmentsBaseURL` | `PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL` | `data/` | Base URL for attachments |
| `title` | `PLAYWRIGHT_HTML_TITLE` | _(none)_ | Custom report title |
| `noSnippets` | `PLAYWRIGHT_HTML_NO_SNIPPETS` | `false` | Disable source code snippets |

## How it works

1. **`reporter.cjs`** — Node.js Playwright reporter. On test completion it:
   - Copies all attachments (screenshots, traces, videos) to `<outputFolder>/data/<sha1>.<ext>`
   - Zips the full test report JSON and embeds it in `<outputFolder>/index.html`
   - Copies Playwright's trace viewer assets to `<outputFolder>/trace/`
   - Starts an HTTP server and opens the report in the browser (respecting the `open` option)
   - Serves a `/trace/file?path=` endpoint so the embedded trace viewer can load local trace zips

2. **`dist/index.html`** — the frontend, a React app built from `src/`. Reads the embedded ZIP,
   renders test results, screenshots, diffs, and links to the trace viewer.

The report requires the HTTP server to be running to load attachments and traces. Run
`npx playwright show-report <outputFolder>` to re-open a saved report.

## License

Apache 2.0. This project is a derivative work of the Playwright HTML reporter.
See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
