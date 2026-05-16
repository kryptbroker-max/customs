#!/usr/bin/env node

// Standalone script to generate a sample seizure notice PDF for review
// Run: node scripts/generate-sample-pdf.js

const fs = require('fs');
const path = require('path');
const { generateNoticeHtml } = require('../src/template');
const { generatePdfFromHtml } = require('../src/pdf');

/**
 * Sample data matching the API payload structure
 */
const sampleData = {
  recipient_name: 'JOYCE HEBDEN',
  recipient_address: [
    '1 Example Street',
    'Langley',
    'Berkshire SL3 8AQ',
    'United Kingdom'
  ],
  vehicle_vin: '5YJXC4E28PM1234566',
  vehicle_description: 'White Tesla Model X',
  date_of_notice: '14 May 2026'
};

async function generateSamplePdf() {
  try {
    console.log('📋 Generating sample notice HTML...');
    const html = generateNoticeHtml(sampleData);

    console.log('🖨️  Converting HTML to PDF (this may take a moment)...');
    const pdfBuffer = await generatePdfFromHtml(html);

    // Save to project root as sample_notice.pdf
    const outputPath = path.join(__dirname, '..', 'sample_notice.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);

    console.log(`✅ Sample PDF generated successfully!`);
    console.log(`📄 Location: ${outputPath}`);
    console.log(`📊 Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error generating sample PDF:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

generateSamplePdf();
