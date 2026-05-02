/**
 * Quick test for trend ingestion + intelligence pipeline
 * Run: node scripts/test-trends.js
 */

import 'dotenv/config';
import { trendIngestionService } from '../src/services/TrendIngestionService.js';
import { contentIntelligenceService } from '../src/services/ContentIntelligenceService.js';
import { db } from '../src/db/index.js';
import { trendCandidates } from '../src/db/schema.js';
import { desc } from 'drizzle-orm';

const step = (msg) => console.log(`\n${'─'.repeat(60)}\n▶  ${msg}\n${'─'.repeat(60)}`);
const ok   = (msg) => console.log(`✅  ${msg}`);
const warn = (msg) => console.log(`⚠️   ${msg}`);
const info = (msg) => console.log(`   ${msg}`);

// ─── 1. Run ingestion ────────────────────────────────────────────────────────

step('Step 1: Running trend ingestion (all sources)');

const ingestResult = await trendIngestionService.runAll();

ok(`Ingested: ${ingestResult.ingested}  |  Skipped (already stored): ${ingestResult.skipped}`);
if (ingestResult.errors?.length) {
  warn(`Errors: ${ingestResult.errors.join(', ')}`);
}

// ─── 2. Show what was ingested ───────────────────────────────────────────────

step('Step 2: Latest 20 ingested candidates (newest first)');

const latest = await db
  .select({
    id: trendCandidates.id,
    source: trendCandidates.source_name,
    title: trendCandidates.title,
    lifecycle: trendCandidates.lifecycle_stage,
    velocity: trendCandidates.velocity_score,
    classification: trendCandidates.classification,
  })
  .from(trendCandidates)
  .orderBy(desc(trendCandidates.ingested_at))
  .limit(20);

if (!latest.length) {
  warn('No candidates in DB — check DB connection or that sources returned data');
} else {
  for (const row of latest) {
    const classified = row.classification ? `[${row.classification}]` : '[unclassified]';
    const velocity   = row.velocity ? `  velocity=${Number(row.velocity).toLocaleString()}` : '';
    info(`${row.source.padEnd(30)} ${classified.padEnd(20)} ${row.lifecycle.padEnd(10)}${velocity}`);
    info(`   "${row.title.slice(0, 80)}${row.title.length > 80 ? '…' : ''}"`);
  }
}

// ─── 3. Breakdown by source ──────────────────────────────────────────────────

step('Step 3: Count by source');

const all = await db.select({ source: trendCandidates.source_name }).from(trendCandidates);
const bySource = {};
for (const row of all) {
  bySource[row.source] = (bySource[row.source] ?? 0) + 1;
}
for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  info(`${String(count).padStart(4)}  ${source}`);
}

// ─── 4. Run classification (requires OPENAI_API_KEY) ────────────────────────

step('Step 4: AI classification (needs OPENAI_API_KEY)');

if (!process.env.OPENAI_API_KEY) {
  warn('OPENAI_API_KEY not set — skipping classification');
} else {
  const classifyResult = await contentIntelligenceService.classifyPendingCandidates(10);
  ok(`Classified ${classifyResult.classified} candidates`);

  // Show classified samples
  const classified = await db
    .select({
      title: trendCandidates.title,
      source: trendCandidates.source_name,
      classification: trendCandidates.classification,
      lifecycle: trendCandidates.lifecycle_stage,
      emotional_dna: trendCandidates.emotional_dna,
    })
    .from(trendCandidates)
    .orderBy(desc(trendCandidates.ingested_at))
    .limit(5);

  info('\nSample classifications:');
  for (const row of classified) {
    if (!row.classification) continue;
    info(`\n  [${row.classification}] ${row.title.slice(0, 70)}`);
    if (row.emotional_dna) {
      info(`  emotion: ${row.emotional_dna.core_emotion}  |  themes: ${row.emotional_dna.themes?.join(', ')}`);
      info(`  brand fit: ${row.emotional_dna.brand_fit_notes}`);
    }
  }
}

// ─── Done ────────────────────────────────────────────────────────────────────

step('Done');
info(`Total candidates in DB: ${all.length}`);
info(`Next: create a channel via POST /api/v1/channels, then hit POST /api/v1/trends/ingest/run`);

process.exit(0);
