const fs = require('fs');
const path = require('path');
const yazl = require('yazl');
const crypto = require('crypto');

class CustomHtmlReporter {
  constructor(options = {}) {
    this.outputFolder = options.outputFolder || 'custom-report';
  }

  onBegin(config, suite) {
    this.suite = suite;
    this.config = config;
  }

  async onEnd(result) {
    const templatePath = path.join(__dirname, 'dist', 'index.html');
    if (!fs.existsSync(templatePath)) {
      throw new Error('Custom reporter template not found. Run "npm run build" in the reporter project first.');
    }

    const reportData = this._buildReport(result);

    const zipFile = new yazl.ZipFile();
    zipFile.addBuffer(Buffer.from(JSON.stringify(reportData)), 'report.json');

    // Add each file's detailed JSON
    for (const fileSummary of reportData.files) {
      const detailedFile = {
        fileId: fileSummary.fileId,
        fileName: fileSummary.fileName,
        tests: fileSummary.tests.map(ts => this._getTestCase(ts.testId))
      };
      zipFile.addBuffer(Buffer.from(JSON.stringify(detailedFile)), `${fileSummary.fileId}.json`);
    }

    zipFile.end();

    const zipBuffer = await new Promise((resolve) => {
      const buffers = [];
      zipFile.outputStream.on('data', (d) => buffers.push(d));
      zipFile.outputStream.on('end', () => resolve(Buffer.concat(buffers)));
    });

    if (!fs.existsSync(this.outputFolder)) fs.mkdirSync(this.outputFolder, { recursive: true });

    const template = fs.readFileSync(templatePath, 'utf-8');
    const dataString = zipBuffer.toString('base64');
    const dataScript = `<script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,${dataString}</script>`;
    
    fs.writeFileSync(path.join(this.outputFolder, 'index.html'), template + dataScript);
    console.log(`\nCustom report generated at ${path.resolve(this.outputFolder)}/index.html`);
  }

  _getTestCase(testId) {
    const testCase = this.suite.allTests().find(t => t.id === testId);
    return {
      testId: testCase.id,
      title: testCase.title,
      path: testCase.titlePath(),
      projectName: testCase.parent.project().name,
      location: testCase.location,
      annotations: testCase.annotations,
      tags: testCase.tags,
      outcome: testCase.outcome(),
      duration: testCase.results.reduce((acc, r) => acc + r.duration, 0),
      ok: testCase.ok(),
      results: testCase.results.map(r => ({
        retry: r.retry,
        startTime: r.startTime.toISOString(),
        duration: r.duration,
        steps: r.steps.map(s => this._serializeStep(s)),
        errors: r.errors.map(e => ({ message: e.message || e.value })),
        attachments: r.attachments.map(a => this._serializeAttachment(a)),
        status: r.status,
        annotations: r.annotations,
        workerIndex: r.workerIndex
      }))
    };
  }

  _serializeStep(step) {
    return {
      title: step.title,
      startTime: step.startTime.toISOString(),
      duration: step.duration,
      location: step.location,
      steps: step.steps.map(s => this._serializeStep(s)),
      attachments: [], // Simplified
      count: 1
    };
  }

  _serializeAttachment(attachment) {
    // Inline images as base64 data URIs so they display in the standalone HTML report
    // without needing a server. Other attachment types keep their disk path.
    if (attachment.path && attachment.contentType.startsWith('image/')) {
      try {
        const data = fs.readFileSync(attachment.path);
        return {
          name: attachment.name,
          contentType: attachment.contentType,
          path: `data:${attachment.contentType};base64,${data.toString('base64')}`
        };
      } catch {
        // file not found, fall through to plain path
      }
    }
    return {
      name: attachment.name,
      contentType: attachment.contentType,
      path: attachment.path
    };
  }

  _buildReport(result) {
    const files = [];
    const stats = { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true };
    const projectNames = new Set();

    // The root suite has child suites for each project
    for (const projectSuite of this.suite.suites) {
      const projectName = projectSuite.project().name;
      projectNames.add(projectName);

      // Each project suite has child suites for each file
      for (const fileSuite of projectSuite.suites) {
        const fileName = fileSuite.title; // For file suites, title is the relative path
        const fileId = crypto.createHash('sha1').update(fileName).digest('hex').slice(0, 20);
        
        let fileSummary = files.find(f => f.fileId === fileId);
        if (!fileSummary) {
          fileSummary = {
            fileId,
            fileName,
            tests: [],
            stats: { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0, ok: true }
          };
          files.push(fileSummary);
        }

        for (const test of fileSuite.allTests()) {
          const outcome = test.outcome();
          const testSummary = {
            testId: test.id,
            title: test.title,
            path: test.titlePath(),
            projectName,
            location: test.location,
            annotations: test.annotations,
            tags: test.tags,
            outcome,
            duration: test.results.reduce((acc, r) => acc + r.duration, 0),
            ok: test.ok(),
            results: test.results.map(r => ({
              attachments: r.attachments.map(a => this._serializeAttachment(a)),
              startTime: r.startTime.toISOString(),
              workerIndex: r.workerIndex
            }))
          };

          fileSummary.tests.push(testSummary);
          fileSummary.stats.total++;
          stats.total++;
          
          if (outcome === 'expected') { fileSummary.stats.expected++; stats.expected++; }
          if (outcome === 'unexpected') { fileSummary.stats.unexpected++; stats.unexpected++; fileSummary.stats.ok = stats.ok = false; }
          if (outcome === 'flaky') { fileSummary.stats.flaky++; stats.flaky++; }
          if (outcome === 'skipped') { fileSummary.stats.skipped++; stats.skipped++; }
        }
      }
    }

    return {
      metadata: {},
      files,
      stats,
      projectNames: Array.from(projectNames),
      startTime: result.startTime.getTime(),
      duration: result.duration,
      machines: [],
      errors: [],
      options: { title: 'My Awesome Playwright Report' }
    };
  }
}

module.exports = CustomHtmlReporter;
