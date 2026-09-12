const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('./git');

function universe() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'knowledge', 'universe.md'), 'utf8');
  const rows = [...text.matchAll(/^\|\s*([A-Z]+)\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|$/gm)];
  return rows.map((m) => ({
    ticker: m[1].trim(),
    company: m[2].trim(),
    sector: m[3].trim(),
    tier: m[4].trim(),
    inMandate: m[5].trim().startsWith('Yes'),
  }));
}

function tickerInfo(ticker) {
  return universe().find((u) => u.ticker === ticker.toUpperCase());
}

function sectorNote(sector) {
  const text = fs.readFileSync(path.join(WORKSPACE, 'knowledge', 'sectors.md'), 'utf8');
  const heading = sector.split('/')[0].trim();
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
  const match = text.match(re);
  return match ? match[1].trim() : '';
}

module.exports = { universe, tickerInfo, sectorNote };
