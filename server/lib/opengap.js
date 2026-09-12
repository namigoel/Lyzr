// Thin wrapper around the real @open-gitagent/opengap CLI, run against the
// live agent workspace. No shell interpolation — args are passed as an array.

const path = require('path');
const { execFile } = require('child_process');
const { WORKSPACE } = require('./git');

const BIN = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'opengap');

function run(args) {
  return new Promise((resolve) => {
    execFile(BIN, [...args, '--dir', WORKSPACE], { timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        output: stripAnsi((stdout || '') + (stderr || '')),
      });
    });
  });
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = {
  validate: () => run(['validate', '--compliance']),
  info: () => run(['info']),
  audit: () => run(['audit']),
  exportSystemPrompt: () => run(['export', '--format', 'system-prompt']),
};
