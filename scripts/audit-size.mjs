#!/usr/bin/env node
/**
 * Hafz App Shell Size & Performance Audit (Phase 4.3)
 * Verifies that the total app shell (HTML, CSS, JS, Manifest, SW, SVG icon)
 * stays well under the 50 KB gzipped budget.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

export const BUDGET_GZIP_BYTES = 50 * 1024; // 50 KB

export const SHELL_FILES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'styles/main.css',
  'src/main.js',
  'src/player.js',
  'src/loader.js',
  'src/parser.js',
  'public/icons/icon.svg'
];

export async function auditAppShellSize(rootDir = ROOT_DIR) {
  const breakdown = [];
  let totalRawBytes = 0;
  let totalGzipBytes = 0;

  for (const relPath of SHELL_FILES) {
    const absPath = join(rootDir, relPath);
    const content = await readFile(absPath);
    const rawBytes = content.byteLength;
    const gzipBytes = gzipSync(content, { level: 9 }).byteLength;

    totalRawBytes += rawBytes;
    totalGzipBytes += gzipBytes;
    breakdown.push({ file: relPath, rawBytes, gzipBytes });
  }

  return {
    breakdown,
    totalRawBytes,
    totalGzipBytes,
    budgetGzipBytes: BUDGET_GZIP_BYTES,
    withinBudget: totalGzipBytes <= BUDGET_GZIP_BYTES
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await auditAppShellSize();
  console.log('Hafz App Shell Size Audit:');
  for (const item of report.breakdown) {
    console.log(
      `  - ${item.file.padEnd(26)} ${(item.rawBytes / 1024).toFixed(2)} KB raw | ${(item.gzipBytes / 1024).toFixed(2)} KB gzip`
    );
  }
  console.log(
    `\nTotal App Shell: ${(report.totalRawBytes / 1024).toFixed(2)} KB raw | ${(report.totalGzipBytes / 1024).toFixed(2)} KB gzip (Budget: ${(report.budgetGzipBytes / 1024).toFixed(0)} KB)`
  );
  if (!report.withinBudget) {
    console.error('FAIL: App shell exceeds 50 KB gzipped budget!');
    process.exit(1);
  }
}
