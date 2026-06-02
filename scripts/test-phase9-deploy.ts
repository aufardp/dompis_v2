import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

function extractPm2Port(ecosystemContent: string): number {
  const match = ecosystemContent.match(/args:\s*'start -p (\d+)'/);
  assert.ok(match, 'Unable to find PM2 web port');
  return Number(match[1]);
}

function extractNginxUpstreamPort(nginxContent: string): number {
  const match = nginxContent.match(/server 127\.0\.0\.1:(\d+);/);
  assert.ok(match, 'Unable to find nginx upstream port');
  return Number(match[1]);
}

function testPortConsistency() {
  const ecosystem = read('ecosystem.config.js');
  const nginx = read('nginx.conf');

  const pm2Port = extractPm2Port(ecosystem);
  const nginxPort = extractNginxUpstreamPort(nginx);

  assert.equal(pm2Port, 9005);
  assert.equal(nginxPort, pm2Port);
}

function testDeployScriptTargetsCurrentApps() {
  const deployScript = read('deploy.sh');

  for (const appName of [
    'dompis-server',
    'dompis-ops-worker',
    'dompis-ingestion-worker',
    'dompis-projection-worker',
    'dompis-active-refresh-worker',
    'dompis-status-refresh-worker',
  ]) {
    assert.match(
      deployScript,
      new RegExp(appName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')),
    );
  }

  assert.doesNotMatch(deployScript, /\bpm2 reload web\b/);
  assert.doesNotMatch(deployScript, /\bcron-worker\b/);
}

function testRolloutDocMentionsRollback() {
  const rolloutDoc = read('docs/phase-9/production-rollout.md');
  assert.match(rolloutDoc, /Rollback/i);
  assert.match(rolloutDoc, /127\.0\.0\.1:9005/);
  assert.match(rolloutDoc, /dompis-server/);
}

function main() {
  testPortConsistency();
  testDeployScriptTargetsCurrentApps();
  testRolloutDocMentionsRollback();
  console.log('[test:phase9] deployment artifacts passed');
}

main();
