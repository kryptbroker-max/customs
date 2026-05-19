#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const inboxPath = path.join(repoRoot, 'data', 'inbox.json');
const backupPath = path.join(repoRoot, 'data', `inbox.json.test-backup-${process.pid}`);

function runScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName)], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status ?? 1}`);
  }
}

function main() {
  if (!fs.existsSync(inboxPath)) {
    throw new Error(`Missing inbox store: ${inboxPath}`);
  }

  fs.copyFileSync(inboxPath, backupPath);

  try {
    runScript('seed-test-data.js');
    runScript('test-admin-render.js');
    runScript('simulate-thread.js');
    runScript('test-full-flow.js');
    runScript('test-telegram-flow.js');
    console.log('\nLocal test suite passed.');
  } finally {
    fs.copyFileSync(backupPath, inboxPath);
    fs.unlinkSync(backupPath);
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}