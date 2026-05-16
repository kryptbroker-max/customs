// PDF generation module using Puppeteer
// Exports a single function that accepts HTML string and returns a PDF buffer
const puppeteer = require('puppeteer');

/**
 * Generate an A4, print-ready PDF buffer from HTML content.
 * Keeps everything in memory (no disk I/O).
 * @param {string} html - Full HTML document or fragment to render.
 * @returns {Promise<Buffer>} - PDF data as a Buffer
 */
async function generatePdfFromHtml(html) {
  if (!html || typeof html !== 'string') {
    throw new TypeError('html must be a non-empty string');
  }

  // Launch Puppeteer. For many Linux environments (containers) we need no-sandbox.
  // If the environment provides a PUPPETEER_EXECUTABLE_PATH, use it; otherwise let Puppeteer
  // use its bundled Chromium by not specifying `executablePath` (more portable).
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH && process.env.PUPPETEER_EXECUTABLE_PATH.length > 0) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();

    // Set a high viewport to ensure correct A4 rendering when converting to PDF.
    await page.setViewport({ width: 1200, height: 1700 });

    // Use setContent which accepts an HTML string and waits for network to be idle.
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Produce a crisp, print-ready A4 PDF.
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      }
    });

    return pdfBuffer;
  } finally {
    // Ensure browser is always closed to avoid resource leaks.
    await browser.close();
  }
}

module.exports = { generatePdfFromHtml };
