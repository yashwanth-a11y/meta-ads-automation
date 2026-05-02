/**
 * Parse storyboard-style scripts with SCENE blocks (Image Prompt / Video Motion / On-screen Text).
 * Used to drive one Models Lab generation per scene, then merge with Shotstack.
 */

const DEFAULT_SCENE_SEC = 3;

/**
 * @param {string} script
 * @returns {{ index: number, prompt: string, targetDurationSec: number }[]}
 */
export function parseScenesFromScript(script) {
  const text = String(script ?? '');
  if (!/\bSCENE\s+\d+/i.test(text)) return [];

  const lines = text.split(/\r?\n/);
  const scenes = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const header = line.match(/^\s*SCENE\s+(\d+)\s*(?:\(([^)]*)\))?\s*$/i);
    if (!header) {
      i++;
      continue;
    }

    const sceneIndex = Number(header[1]);
    let targetDurationSec = DEFAULT_SCENE_SEC;
    const paren = (header[2] || '').trim();
    const range = paren.match(/(\d+)\s*-\s*(\d+)\s*s/i);
    if (range) {
      targetDurationSec = Math.max(1, Number(range[2]) - Number(range[1]));
    }

    i++;
    const chunk = [];
    while (i < lines.length && !/^\s*SCENE\s+\d+/i.test(lines[i])) {
      chunk.push(lines[i]);
      i++;
    }

    const block = chunk.join('\n');
    const img = block.match(/Image Prompt:\s*([^\n]+)/i);
    const motion = block.match(/Video Motion:\s*([^\n]+)/i);
    const ost = block.match(/On-screen Text:\s*([^\n]+)/i);

    const parts = [];
    if (img?.[1]) parts.push(`Visual: ${img[1].trim()}`);
    if (motion?.[1]) parts.push(`Camera/motion: ${motion[1].trim()}`);
    if (ost?.[1]) parts.push(`On-screen title: "${ost[1].trim()}"`);

    if (parts.length === 0) continue;

    const prompt = [
      'Vertical 9:16 social video scene. Cinematic, sharp readable typography.',
      ...parts,
      'Smooth natural motion, professional lighting.',
    ].join(' ');

    scenes.push({
      index: sceneIndex,
      prompt: prompt.slice(0, 2400),
      targetDurationSec: Math.min(8, Math.max(2, targetDurationSec)),
    });
  }

  scenes.sort((a, b) => a.index - b.index);
  return scenes;
}
