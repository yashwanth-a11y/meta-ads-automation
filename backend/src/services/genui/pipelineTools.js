// ─── Pipeline tool implementations ────────────────────────────────────────────
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { pipelineRuns } from '../../db/schema.js';

export async function getPipelineHistory({ limit = 10 } = {}, _orgId) {
  const rows = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      started_at: pipelineRuns.started_at,
      completed_at: pipelineRuns.completed_at,
      ingested: pipelineRuns.ingested,
      classified: pipelineRuns.classified,
      scored: pipelineRuns.scored,
      bundles_generated: pipelineRuns.bundles_generated,
      errors: pipelineRuns.errors,
    })
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.started_at))
    .limit(Math.min(Number(limit) || 10, 20));

  if (!rows.length) {
    return { raw: [], eventType: 'stat', payload: [{ label: 'Pipeline Runs', value: '0', delta: 'No pipeline runs yet — type "run pipeline" to start one' }] };
  }

  const lastRun = rows[0];
  const successCount = rows.filter((r) => r.status === 'done').length;
  const failCount = rows.filter((r) => r.status === 'failed').length;

  const durationStr = (run) => {
    if (!run.completed_at || !run.started_at) return '—';
    const secs = Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const chartData = rows.slice(0, 10).reverse().map((r) => ({
    date: r.started_at ? new Date(r.started_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—',
    Ingested: r.ingested ?? 0,
    Classified: r.classified ?? 0,
    Scored: r.scored ?? 0,
    Bundles: r.bundles_generated ?? 0,
    status: r.status,
  }));

  const statItems = [
    { label: 'Total Runs', value: String(rows.length), delta: `✓ ${successCount} succeeded · ✗ ${failCount} failed` },
    { label: 'Last Run', value: lastRun.status === 'done' ? '✓ Done' : lastRun.status === 'failed' ? '✗ Failed' : '⏳ Running', delta: `${lastRun.ingested ?? 0} ingested · ${lastRun.scored ?? 0} scored · ${lastRun.bundles_generated ?? 0} bundles · ${durationStr(lastRun)}` },
    { label: 'Last Started', value: lastRun.started_at ? new Date(lastRun.started_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
  ];

  return {
    raw: rows,
    eventType: 'chart',
    payload: {
      chartType: 'bar',
      title: `Pipeline History (last ${chartData.length} runs)`,
      data: chartData,
      xKey: 'date',
      yKeys: ['Ingested', 'Scored', 'Bundles'],
    },
  };
}

// Mutating — surface action button only
export async function runTrendPipeline(_input, _orgId) {
  return { raw: { queued: true }, eventType: null, payload: null };
}
