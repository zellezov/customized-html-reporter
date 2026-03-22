const fs = require('fs');
const path = require('path');
const http = require('http');
const yazl = require('yazl');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

// Copied from vendor/isomorphic/stringUtils.ts — strips ANSI escape codes.
const _ansiRegex = new RegExp(
    '([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))',
    'g'
);
function _stripAnsiEscapes(str) {
  return str.replace(_ansiRegex, '');
}

function _normalizeAnnotations(annotations) {
  return (annotations || []).map(a => ({
    type: a.type,
    description: a.description === undefined ? undefined : String(a.description),
    location: a.location ? { file: a.location.file, line: a.location.line, column: a.location.column } : undefined,
  }));
}

function _isTextContentType(contentType) {
  return contentType.startsWith('text/') || contentType.startsWith('application/json');
}

function _extFromContentType(contentType) {
  const base = contentType.split(';')[0].trim().toLowerCase();
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/zip': 'zip',
    'application/json': 'json', 'text/plain': 'txt', 'text/html': 'html',
    'video/webm': 'webm',
  };
  return map[base] || 'dat';
}

function _sanitizeForFilePath(str) {
  return str.replace(/[^a-zA-Z0-9\-_.]/g, '_');
}

function _removeFolderSync(folder) {
  try { fs.rmSync(folder, { recursive: true, force: true }); } catch { }
}

// Returns the codeFrameColumns function from @babel/code-frame, or null if unavailable.
function _getCodeFrameColumns() {
  const sources = ['@babel/code-frame', 'playwright-core/lib/transform/babelBundle'];
  for (const src of sources) {
    try {
      const mod = require(src);
      const fn = mod.codeFrameColumns || mod.default?.codeFrameColumns;
      if (typeof fn === 'function') return fn;
    } catch { }
  }
  return null;
}

// Generates syntax-highlighted code snippets for steps, mutating step.snippet in place.
// Mirrors html.ts createSnippets(). stepsInFile maps absolute file path → serialized step objects.
function _createSnippets(stepsInFile) {
  const codeFrameColumns = _getCodeFrameColumns();
  if (!codeFrameColumns) return;
  for (const [file, steps] of stepsInFile) {
    let source;
    try { source = fs.readFileSync(file, 'utf-8') + '\n//'; } catch { continue; }
    const lines = source.split('\n').length;
    const highlighted = codeFrameColumns(source, { start: { line: lines, column: 1 } }, {
      highlightCode: true, linesAbove: lines, linesBelow: 0,
    });
    const highlightedLines = highlighted.split('\n');
    const lineWithArrow = highlightedLines[highlightedLines.length - 1];
    const arrowIndex = lineWithArrow.indexOf('^');
    for (const step of steps) {
      if (!step.location || step.location.line < 2 || step.location.line >= lines) continue;
      const snippetLines = highlightedLines.slice(step.location.line - 2, step.location.line + 1);
      if (arrowIndex !== -1) {
        const col = step.location.column || 1;
        const shiftedArrow = lineWithArrow.slice(0, arrowIndex) + ' '.repeat(col - 1) + lineWithArrow.slice(arrowIndex);
        snippetLines.splice(2, 0, shiftedArrow);
      }
      step.snippet = snippetLines.join('\n');
    }
  }
}

// Generates a babel-style codeframe for an error at a location.
// Mirrors html.ts createErrorCodeframe(). location uses absolute file path.
function _createErrorCodeframe(message, location) {
  const codeFrameColumns = _getCodeFrameColumns();
  if (!codeFrameColumns || !location?.file) return undefined;
  let source;
  try { source = fs.readFileSync(location.file, 'utf-8') + '\n//'; } catch { return undefined; }
  return codeFrameColumns(source, { start: { line: location.line, column: location.column } }, {
    highlightCode: false, linesAbove: 100, linesBelow: 100,
    message: _stripAnsiEscapes(message).split('\n')[0] || undefined,
  }) || undefined;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function _mimeForExt(ext) {
  const map = {
    'html': 'text/html; charset=utf-8', 'js': 'application/javascript',
    'css': 'text/css', 'json': 'application/json',
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'webm': 'video/webm', 'txt': 'text/plain; charset=utf-8',
    'zip': 'application/zip', 'woff': 'font/woff', 'woff2': 'font/woff2',
    'ttf': 'font/ttf',
  };
  return map[ext] || 'application/octet-stream';
}

async function _startServer(folder, host, preferredPort) {
  const tryListen = (port) => new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = '/index.html';
      let searchParams;
      try {
        const parsed = new URL('http://localhost' + req.url);
        urlPath = parsed.pathname || '/index.html';
        searchParams = parsed.searchParams;
      } catch { }
      if (urlPath === '/') urlPath = '/index.html';

      // Special endpoint: /trace/file?path=<absolute_path>
      // The trace viewer uses this to load trace zip files by absolute path.
      if (urlPath.startsWith('/trace/file') && searchParams?.has('path')) {
        const filePath = searchParams.get('path');
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(data);
        });
        return;
      }

      const filePath = path.join(folder, ...urlPath.split('/').filter(Boolean));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        res.writeHead(200, { 'Content-Type': _mimeForExt(ext) });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(port, host || 'localhost', () => resolve(server));
  });

  let server;
  try {
    server = await tryListen(preferredPort || 9323);
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      server = await tryListen(0);
    } else {
      throw e;
    }
  }
  const addr = server.address();
  const resolvedHost = (host || 'localhost') === '0.0.0.0' ? 'localhost' : (host || 'localhost');
  return { server, url: `http://${resolvedHost}:${addr.port}` };
}

function _openBrowser(url) {
  // Fire-and-forget: open the browser without waiting for it to close.
  try {
    const { open } = require('playwright-core/lib/utilsBundle');
    open(url).catch(() => {});
    return;
  } catch { }

  let cmd;
  if (process.platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (process.platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    let isWsl = false;
    try { isWsl = /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { }
    cmd = isWsl ? `cmd.exe /c start "" "${url}"` : `xdg-open "${url}"`;
  }
  try { execSync(cmd, { stdio: 'ignore' }); } catch { }
}

async function showReport(folder, host, port) {
  if (!folder) folder = 'playwright-report';
  const absFolder = path.resolve(folder);
  if (!fs.existsSync(absFolder) || !fs.statSync(absFolder).isDirectory()) {
    console.error(`No report found at "${absFolder}"`);
    process.exit(1);
  }
  const { url } = await _startServer(absFolder, host, port);
  console.log(`\n  Serving HTML report at ${url}. Press Ctrl+C to quit.\n`);
  _openBrowser(url);
  // Always block until Ctrl+C — same as the built-in Playwright reporter.
  // This keeps the server alive for traces, screenshots, and multi-tab browsing.
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

class CustomHtmlReporter {
  constructor(options = {}) {
    const envOutputFolder = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT;
    this.outputFolder = envOutputFolder
        ? path.resolve(envOutputFolder)
        : (options.outputFolder || 'custom-report');
    this._open = process.env.PLAYWRIGHT_HTML_OPEN || options.open || 'on-failure';
    this._options = options;
    this._topLevelErrors = [];
    this._host = process.env.PLAYWRIGHT_HTML_HOST || options.host;
    this._port = process.env.PLAYWRIGHT_HTML_PORT ? +process.env.PLAYWRIGHT_HTML_PORT : options.port;
    this._attachmentsBaseURL = process.env.PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL || options.attachmentsBaseURL || 'data/';
  }

  onBegin(config, suite) {
    this.suite = suite;
    this.config = config;
  }

  onError(error) {
    this._topLevelErrors.push(error);
  }

  async onEnd(result) {
    const templatePath = path.join(__dirname, 'dist', 'index.html');
    if (!fs.existsSync(templatePath))
      throw new Error('Custom reporter template not found. Run "yarn build" in the reporter project first.');

    // Clear and recreate the output folder.
    _removeFolderSync(this.outputFolder);
    fs.mkdirSync(this.outputFolder, { recursive: true });

    // Per-run state.
    this._dataFolder = path.join(this.outputFolder, 'data');
    this._dataFolderCreated = false;
    this._hasTraces = false;
    // Maps absolute file path → serialized step objects, for snippet generation.
    this._stepsInFile = new Map();

    const reportData = this._buildReport(result);

    // Phase 1: build all detailed file objects (side-effects: copies attachments to data/).
    const detailedFiles = reportData.files.map(fileSummary => ({
      fileId: fileSummary.fileId,
      fileName: fileSummary.fileName,
      tests: fileSummary.tests.map(ts => this._getTestCase(ts.testId)),
    }));

    // Phase 2: add code snippets to steps (mutates step objects built above).
    if (!this._resolveNoSnippets())
      _createSnippets(this._stepsInFile);

    // Phase 3: zip report data + per-file detailed JSON.
    const zipFile = new yazl.ZipFile();
    zipFile.addBuffer(Buffer.from(JSON.stringify(reportData)), 'report.json');
    for (const detailedFile of detailedFiles)
      zipFile.addBuffer(Buffer.from(JSON.stringify(detailedFile)), `${detailedFile.fileId}.json`);

    zipFile.end();
    const zipBuffer = await new Promise((resolve) => {
      const buffers = [];
      zipFile.outputStream.on('data', d => buffers.push(d));
      zipFile.outputStream.on('end', () => resolve(Buffer.concat(buffers)));
    });

    // Copy index.html template and append zip data script.
    const reportIndexPath = path.join(this.outputFolder, 'index.html');
    fs.copyFileSync(templatePath, reportIndexPath);
    fs.appendFileSync(reportIndexPath,
        `<script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,${zipBuffer.toString('base64')}</script>`);

    // Copy trace viewer assets if any trace attachments were found.
    if (this._hasTraces)
      this._copyTraceViewer();

    console.log(`\nCustom report generated: ${path.resolve(this.outputFolder)}`);
    this._ok = result.status === 'passed';
  }

  async onExit() {
    if (process.env.CI)
      return;
    if (this._ok === undefined || !fs.existsSync(this.outputFolder))
      return;

    const isCodingAgent = !!process.env.CLAUDECODE || !!process.env.COPILOT_CLI;
    const shouldOpen = !isCodingAgent && !!process.stdin.isTTY &&
        (this._open === 'always' || (!this._ok && this._open === 'on-failure'));

    if (shouldOpen) {
      await showReport(this.outputFolder, this._host, this._port);
    } else if (process.stdin.isTTY) {
      const rel = path.relative(process.cwd(), this.outputFolder);
      const folderArg = rel === 'playwright-report' ? '' : ' ' + rel;
      const hostArg = this._host ? ` --host ${this._host}` : '';
      const portArg = this._port ? ` --port ${this._port}` : '';
      console.log('');
      console.log('To open last HTML report run:');
      console.log(`\n  npx playwright show-report${folderArg}${hostArg}${portArg}\n`);
    }
  }

  _copyTraceViewer() {
    try {
      const traceViewerSrc = path.join(require.resolve('playwright-core'), '..', 'lib', 'vite', 'traceViewer');
      const traceViewerDst = path.join(this.outputFolder, 'trace');
      const assetsDst = path.join(traceViewerDst, 'assets');
      fs.mkdirSync(assetsDst, { recursive: true });
      for (const file of fs.readdirSync(traceViewerSrc)) {
        if (file.endsWith('.map') || file.includes('watch') || file === 'assets') continue;
        fs.copyFileSync(path.join(traceViewerSrc, file), path.join(traceViewerDst, file));
      }
      for (const file of fs.readdirSync(path.join(traceViewerSrc, 'assets'))) {
        if (file.endsWith('.map') || file.includes('xtermModule')) continue;
        fs.copyFileSync(path.join(traceViewerSrc, 'assets', file), path.join(assetsDst, file));
      }
    } catch { /* trace viewer unavailable in this playwright-core version */ }
  }

  // Returns the describe-chain path [describe1, describe2, ...] for a test,
  // excluding root, project, file suite, and the test title itself.
  _testPath(test) {
    const result = [];
    let suite = test.parent;
    while (suite) {
      const parent = suite.parent;
      if (!parent) break;
      const grandparent = parent.parent;
      if (!grandparent) break;
      if (!grandparent.parent) break; // suite is the file suite
      result.unshift(suite.title);
      suite = parent;
    }
    return result.filter(t => t.length > 0);
  }

  _relativeLocation(location) {
    if (!location) return undefined;
    return {
      file: path.relative(this.config.rootDir, location.file).replace(/\\/g, '/'),
      line: location.line,
      column: location.column,
    };
  }

  _getTestCase(testId) {
    const testCase = this.suite.allTests().find(t => t.id === testId);
    const outcome = testCase.outcome();
    return {
      testId: testCase.id,
      title: testCase.title,
      path: this._testPath(testCase),
      projectName: testCase.parent.project().name,
      location: this._relativeLocation(testCase.location),
      annotations: _normalizeAnnotations(testCase.annotations),
      tags: testCase.tags,
      outcome,
      duration: testCase.results.reduce((acc, r) => acc + r.duration, 0),
      ok: outcome === 'expected' || outcome === 'flaky',
      results: testCase.results.map(r => ({
        retry: r.retry,
        startTime: r.startTime.toISOString(),
        duration: r.duration,
        steps: this._dedupeSteps(r.steps).map(({ step, count, duration }) => ({
          ...this._serializeStep(step, r),
          count,
          duration,
        })),
        errors: r.errors.map(e => ({
          message: e.stack || e.message || e.value || '',
          codeframe: _createErrorCodeframe(e.stack || e.message || '', e.location),
        })),
        attachments: this._serializeAllAttachments(r),
        status: r.status,
        annotations: _normalizeAnnotations(r.annotations),
        workerIndex: r.workerIndex,
      })),
    };
  }

  // result is passed through to compute step attachment indices.
  _serializeStep(step, result) {
    const skipped = step.annotations?.find(a => a.type === 'skip');
    let title = step.title;
    if (skipped)
      title = `${title} (skipped${skipped.description ? ': ' + skipped.description : ''})`;

    const serialized = {
      title,
      startTime: step.startTime.toISOString(),
      duration: step.duration,
      location: this._relativeLocation(step.location),
      steps: this._dedupeSteps(step.steps).map(({ step: s, count, duration }) => ({
        ...this._serializeStep(s, result),
        count,
        duration,
      })),
      // Indices into the result's serialized attachments array.
      attachments: (step.attachments || [])
          .map(a => result.attachments.indexOf(a))
          .filter(i => i !== -1),
      count: 1,
      error: step.error?.message,
      skipped: !!skipped,
    };

    // Register for snippet generation using the absolute file path.
    if (step.location?.file) {
      if (!this._stepsInFile.has(step.location.file))
        this._stepsInFile.set(step.location.file, []);
      this._stepsInFile.get(step.location.file).push(serialized);
    }

    return serialized;
  }

  _dedupeSteps(steps) {
    const result = [];
    let lastEntry;
    for (const step of steps) {
      const canDedupe = !step.error && step.duration >= 0 && step.location?.file && !step.steps.length;
      const lastStep = lastEntry?.step;
      if (canDedupe && lastEntry && lastStep &&
          step.category === lastStep.category &&
          step.title === lastStep.title &&
          step.location?.file === lastStep.location?.file &&
          step.location?.line === lastStep.location?.line &&
          step.location?.column === lastStep.location?.column) {
        lastEntry.count++;
        lastEntry.duration += step.duration;
        continue;
      }
      lastEntry = { step, count: 1, duration: step.duration };
      result.push(lastEntry);
      if (!canDedupe)
        lastEntry = undefined;
    }
    return result;
  }

  _serializeAllAttachments(result) {
    const all = [
      ...result.attachments,
      ...(result.stdout || []).map(chunk => ({
        name: 'stdout', contentType: 'text/plain',
        body: typeof chunk === 'string' ? chunk : chunk.toString('utf-8'),
      })),
      ...(result.stderr || []).map(chunk => ({
        name: 'stderr', contentType: 'text/plain',
        body: typeof chunk === 'string' ? chunk : chunk.toString('utf-8'),
      })),
    ];

    const out = [];
    let lastEntry;
    for (const a of all) {
      if ((a.name === 'stdout' || a.name === 'stderr') && a.contentType === 'text/plain') {
        const stripped = _stripAnsiEscapes(a.body || '');
        if (lastEntry && lastEntry.name === a.name && lastEntry.contentType === a.contentType) {
          lastEntry.body += stripped;
          continue;
        }
        lastEntry = { name: a.name, contentType: a.contentType, body: stripped };
        out.push(lastEntry);
        continue;
      }
      lastEntry = undefined;
      out.push(this._serializeAttachment(a));
    }
    return out;
  }

  _serializeAttachment(attachment) {
    if (attachment.name === 'trace')
      this._hasTraces = true;

    // File-backed attachment: copy to data/<sha1>.<ext>.
    if (attachment.path) {
      let outputPath = attachment.path; // fallback if file is unreadable
      try {
        const buffer = fs.readFileSync(attachment.path);
        const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
        const ext = path.extname(attachment.path); // includes dot, e.g. ".png"
        const fileName = sha1 + ext;
        this._ensureDataFolder();
        fs.writeFileSync(path.join(this._dataFolder, fileName), buffer);
        outputPath = this._attachmentsBaseURL + fileName;
      } catch { }
      return { name: attachment.name, contentType: attachment.contentType, path: outputPath };
    }

    // Buffer body: text types → decode to string; binary → write to data/<sha1>.<ext>.
    if (attachment.body instanceof Buffer) {
      if (_isTextContentType(attachment.contentType)) {
        const charset = attachment.contentType.match(/charset=(.*)/)?.[1];
        try {
          return {
            name: attachment.name,
            contentType: attachment.contentType,
            body: attachment.body.toString(charset || 'utf-8'),
          };
        } catch { /* fall through to binary handling */ }
      }
      const nameExt = _sanitizeForFilePath(path.extname(attachment.name).replace(/^\./, ''));
      const ext = nameExt || _extFromContentType(attachment.contentType);
      const sha1 = crypto.createHash('sha1').update(attachment.body).digest('hex');
      const fileName = `${sha1}.${ext}`;
      this._ensureDataFolder();
      fs.writeFileSync(path.join(this._dataFolder, fileName), attachment.body);
      return { name: attachment.name, contentType: attachment.contentType, path: this._attachmentsBaseURL + fileName };
    }

    // String body — pass through as-is.
    return { name: attachment.name, contentType: attachment.contentType, body: attachment.body };
  }

  _ensureDataFolder() {
    if (!this._dataFolderCreated) {
      fs.mkdirSync(this._dataFolder, { recursive: true });
      this._dataFolderCreated = true;
    }
  }

  _resolveNoSnippets() {
    if (process.env.PLAYWRIGHT_HTML_NO_SNIPPETS === 'false' || process.env.PLAYWRIGHT_HTML_NO_SNIPPETS === '0')
      return false;
    if (process.env.PLAYWRIGHT_HTML_NO_SNIPPETS)
      return true;
    return this._options.noSnippets;
  }

  _resolveNoCopyPrompt() {
    if (process.env.PLAYWRIGHT_HTML_NO_COPY_PROMPT === 'false' || process.env.PLAYWRIGHT_HTML_NO_COPY_PROMPT === '0')
      return false;
    if (process.env.PLAYWRIGHT_HTML_NO_COPY_PROMPT)
      return true;
    return this._options.noCopyPrompt;
  }

  _buildReport(result) {
    const files = [];
    const stats = { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true };
    const projectNames = new Set();

    for (const projectSuite of this.suite.suites) {
      const projectName = projectSuite.project().name;
      projectNames.add(projectName);

      for (const fileSuite of projectSuite.suites) {
        const fileName = fileSuite.title;
        const fileId = crypto.createHash('sha1').update(fileName).digest('hex').slice(0, 20);

        let fileSummary = files.find(f => f.fileId === fileId);
        if (!fileSummary) {
          fileSummary = {
            fileId, fileName, tests: [],
            stats: { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true },
          };
          files.push(fileSummary);
        }

        for (const test of fileSuite.allTests()) {
          const outcome = test.outcome();
          fileSummary.tests.push({
            testId: test.id,
            title: test.title,
            path: this._testPath(test),
            projectName,
            location: this._relativeLocation(test.location),
            annotations: _normalizeAnnotations(test.annotations),
            tags: test.tags,
            outcome,
            duration: test.results.reduce((acc, r) => acc + r.duration, 0),
            ok: outcome === 'expected' || outcome === 'flaky',
            // Summary results: copy attachments to data/ so TraceLink and
            // other badge links resolve correctly from the main page.
            results: test.results.map(r => ({
              attachments: r.attachments.map(a => this._serializeAttachment(a)),
              startTime: r.startTime.toISOString(),
              workerIndex: r.workerIndex,
            })),
          });

          fileSummary.stats.total++;
          stats.total++;
          if (outcome === 'expected') { fileSummary.stats.expected++; stats.expected++; }
          if (outcome === 'unexpected') { fileSummary.stats.unexpected++; stats.unexpected++; fileSummary.stats.ok = stats.ok = false; }
          if (outcome === 'flaky') { fileSummary.stats.flaky++; stats.flaky++; }
          if (outcome === 'skipped') { fileSummary.stats.skipped++; stats.skipped++; }
        }

        fileSummary.tests.sort((t1, t2) => {
          const w = t => (t.outcome === 'unexpected' ? 1000 : 0) + (t.outcome === 'flaky' ? 1 : 0);
          return w(t2) - w(t1);
        });
      }
    }

    files.sort((f1, f2) => {
      const w = f => f.stats.unexpected * 1000 + f.stats.flaky;
      return w(f2) - w(f1);
    });

    return {
      metadata: this.config.metadata || {},
      files,
      stats,
      projectNames: Array.from(projectNames),
      startTime: result.startTime.getTime(),
      duration: result.duration,
      machines: [],
      errors: this._topLevelErrors.map(e => e.stack || e.message || e.value || ''),
      options: {
        title: process.env.PLAYWRIGHT_HTML_TITLE || this._options.title,
        noSnippets: this._resolveNoSnippets(),
        noCopyPrompt: this._resolveNoCopyPrompt(),
      },
    };
  }
}

module.exports = CustomHtmlReporter;
module.exports.showReport = showReport;
