// backend/src/eval/gt-fix/run-all.ts
// Orchestrator: runs fix-invalid-codes, fix-missing-gt, flag-llm-cases in parallel,
// then runs merge-and-review
// Usage: npx tsx src/eval/gt-fix/run-all.ts

import { spawn } from 'child_process';
import * as path from 'path';

const scriptsDir = path.resolve(__dirname);
const backendDir = path.resolve(__dirname, '../../../');

function runScript(name: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(scriptsDir, name);
    const needsDotenv = name !== 'merge-and-review.ts';

    // Quote the script path to handle spaces in directory names
    const quotedPath = `"${scriptPath}"`;
    const cmd = needsDotenv
      ? `npx tsx --require dotenv/config ${quotedPath}`
      : `npx tsx ${quotedPath}`;

    const child = spawn(cmd, [], {
      cwd: backendDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // Prefix each line with script name
      const lines = text.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        process.stdout.write(`[${name.replace('.ts', '')}] ${line}\n`);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      const lines = text.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        process.stderr.write(`[${name.replace('.ts', '')}] ${line}\n`);
      }
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output: stdout + stderr });
    });
  });
}

async function main() {
  console.log('=== Ground Truth Fix Pipeline ===\n');
  console.log('Running 3 analysis scripts in parallel...\n');

  const startTime = Date.now();

  // Run A, B, C in parallel
  const [resultA, resultB, resultC] = await Promise.all([
    runScript('fix-invalid-codes.ts'),
    runScript('fix-missing-gt.ts'),
    runScript('flag-llm-cases.ts'),
  ]);

  const parallelTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nAll 3 scripts finished in ${parallelTime}s`);

  const failures: string[] = [];
  if (resultA.code !== 0) failures.push('fix-invalid-codes');
  if (resultB.code !== 0) failures.push('fix-missing-gt');
  if (resultC.code !== 0) failures.push('flag-llm-cases');

  if (failures.length > 0) {
    console.error(`\nFailed scripts: ${failures.join(', ')}`);
  }

  if (failures.length === 3) {
    console.error('All scripts failed. Aborting merge.');
    process.exit(1);
  }

  // Run merge (depends on outputs above)
  console.log('\nRunning merge-and-review...\n');
  const mergeResult = await runScript('merge-and-review.ts');

  if (mergeResult.code !== 0) {
    console.error('merge-and-review FAILED');
    process.exit(1);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== DONE in ${totalTime}s ===`);
  console.log('Output files:');
  console.log('  backend/eval-results/gt-fix-invalid-codes.json');
  console.log('  backend/eval-results/gt-fix-missing-gt.json');
  console.log('  backend/eval-results/gt-fix-llm-flags.json');
  console.log('  backend/eval-results/gt-fix-proposed.json  (merged)');
  console.log('  backend/eval-results/gt-fix-review.md      (human review)');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
