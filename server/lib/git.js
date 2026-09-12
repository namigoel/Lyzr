const path = require('path');
const simpleGit = require('simple-git');

const WORKSPACE = process.env.WORKSPACE_DIR || path.join(__dirname, '..', '..', 'agent-workspace');
const COVERAGE_DIR = 'memory/coverage';

function repo() {
  return simpleGit({ baseDir: WORKSPACE, binary: 'git', maxConcurrentProcesses: 1 });
}

async function currentBranch() {
  const g = repo();
  const status = await g.status();
  return status.current;
}

async function listBranches() {
  const g = repo();
  const summary = await g.branchLocal();
  return summary.all;
}

async function fileAtRef(ref, relPath) {
  const g = repo();
  try {
    return await g.show([`${ref}:${relPath}`]);
  } catch (err) {
    return null;
  }
}

async function fileHistory(relPath, ref = 'main') {
  const g = repo();
  const raw = await g.raw([
    'log', ref, '--follow',
    '--date=iso-strict',
    '--pretty=format:%H%x1f%ad%x1f%an%x1f%s',
    '--', relPath,
  ]);
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split('\n')
    .map((line) => {
      const [hash, date, author, subject] = line.split('\x1f');
      return { hash, date, author, subject };
    });
}

async function diffRefs(refA, refB, relPath) {
  const g = repo();
  const args = ['diff', `${refA}..${refB}`];
  if (relPath) args.push('--', relPath);
  return g.raw(args);
}

async function diffWorkingBranch(branch, relPath) {
  const g = repo();
  const args = ['diff', `main...${branch}`];
  if (relPath) args.push('--', relPath);
  return g.raw(args);
}

async function createReviewBranch(name) {
  const g = repo();
  await g.checkout('main');
  await g.checkoutLocalBranch(name);
  return name;
}

async function commitOnBranch(branch, relPath, content, message, author) {
  const g = repo();
  await g.checkout(branch);
  const fs = require('fs');
  const fullPath = path.join(WORKSPACE, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  await g.add([relPath]);
  await g.commit(message, undefined, author ? { '--author': author } : undefined);
  const log = await g.log(['-1']);
  await g.checkout('main');
  return log.latest;
}

async function appendAndCommit(relPath, content, message, branch = 'main', author) {
  const g = repo();
  await g.checkout(branch);
  const fs = require('fs');
  const fullPath = path.join(WORKSPACE, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.appendFileSync(fullPath, content, 'utf8');
  await g.add([relPath]);
  await g.commit(message, undefined, author ? { '--author': author } : undefined);
  const log = await g.log(['-1']);
  return log.latest;
}

async function mergeBranch(branch, message) {
  const g = repo();
  await g.checkout('main');
  try {
    await g.merge(['--no-ff', '-m', message, branch]);
  } catch (err) {
    await g.raw(['merge', '--abort']).catch(() => {});
    throw new Error(`merge conflict — could not merge ${branch} into main cleanly: ${err.message}`);
  }
  await g.raw(['branch', '-d', branch]);
  const log = await g.log(['-1']);
  return log.latest;
}

async function deleteBranch(branch) {
  const g = repo();
  await g.checkout('main');
  await g.raw(['branch', '-D', branch]);
}

async function revertCommit(hash) {
  const g = repo();
  await g.checkout('main');
  try {
    await g.raw(['revert', '--no-edit', hash]);
  } catch (err) {
    await g.raw(['revert', '--abort']).catch(() => {});
    throw new Error(`revert conflict — ${hash.slice(0, 8)} could not be cleanly reverted on top of main: ${err.message}`);
  }
  const log = await g.log(['-1']);
  return log.latest;
}

async function writeAndCommitMain(relPath, content, message, author) {
  const g = repo();
  await g.checkout('main');
  const fs = require('fs');
  const fullPath = path.join(WORKSPACE, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  await g.add([relPath]);
  await g.commit(message, undefined, author ? { '--author': author } : undefined);
  const log = await g.log(['-1']);
  return log.latest;
}

module.exports = {
  WORKSPACE,
  COVERAGE_DIR,
  repo,
  currentBranch,
  listBranches,
  fileAtRef,
  fileHistory,
  diffRefs,
  diffWorkingBranch,
  createReviewBranch,
  commitOnBranch,
  appendAndCommit,
  mergeBranch,
  deleteBranch,
  revertCommit,
  writeAndCommitMain,
};
