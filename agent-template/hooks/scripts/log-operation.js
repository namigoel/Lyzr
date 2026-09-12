#!/usr/bin/env node
// Appends one entry to memory/log.md. Reusable as a module (formatEntry) or as a
// standalone hook script per the gitagent hook I/O protocol.

function formatEntry({ date, operation, ticker, actor, detail }) {
  return `\n## [${date}] ${operation} | ${ticker}\n- actor: ${actor}\n- ${detail}\n`;
}

async function runAsHook() {
  const fs = require('fs');
  const path = require('path');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const entry = formatEntry(input.data || {});
  const logPath = path.join(process.cwd(), 'memory', 'log.md');
  fs.appendFileSync(logPath, entry);
  process.stdout.write(JSON.stringify({ action: 'allow', modifications: null, audit: { logged: true } }));
}

module.exports = { formatEntry };

if (require.main === module) {
  runAsHook();
}
