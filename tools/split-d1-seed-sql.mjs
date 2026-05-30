import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(root, 'd1', 'generated', 'songlist_seed.sql');
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(root, 'd1', 'generated', 'console');
const maxBytes = Number(process.argv[4] || 45000);

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    current += ch;

    if (quoted) {
      if (ch === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (ch === "'") {
        quoted = false;
      }
      continue;
    }

    if (ch === "'") {
      quoted = true;
      continue;
    }

    if (ch === ';') {
      const statement = current.trim();
      if (statement && statement !== 'BEGIN TRANSACTION;' && statement !== 'COMMIT;') {
        statements.push(statement);
      }
      current = '';
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function statementGroup(statement) {
  if (/^INSERT INTO channels\b/i.test(statement)) return 'channels';
  if (/^INSERT INTO artists\b/i.test(statement)) return 'artists';
  if (/^INSERT INTO songs\b/i.test(statement)) return 'songs';
  if (/^INSERT INTO song_channel_stats\b/i.test(statement)) return 'song-stats';
  if (/^(INSERT INTO streams|DELETE FROM stream_songs|INSERT INTO stream_songs)\b/i.test(statement)) return 'streams';
  return 'misc';
}

function writeChunks(group, groupOrder, statements) {
  let chunk = [];
  let chunkBytes = 0;
  let index = 1;
  const files = [];

  const flush = () => {
    if (!chunk.length) return;
    const fileName = `${String(groupOrder).padStart(2, '0')}-${group}-${String(index).padStart(2, '0')}.sql`;
    const body = [
      `-- Console chunk: ${group} ${index}`,
      '-- Run d1/schema.sql first. Then run console chunks in file-name order.',
      '',
      chunk.join('\n'),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outputDir, fileName), body, 'utf8');
    files.push(fileName);
    chunk = [];
    chunkBytes = 0;
    index += 1;
  };

  for (const statement of statements) {
    const size = Buffer.byteLength(`${statement}\n`, 'utf8');
    if (chunk.length && chunkBytes + size > maxBytes) flush();
    chunk.push(statement);
    chunkBytes += size;
  }
  flush();
  return files;
}

const sql = fs.readFileSync(inputPath, 'utf8');
const statements = splitStatements(sql).filter((statement) => !statement.startsWith('--'));
const groups = new Map();
for (const statement of statements) {
  const group = statementGroup(statement);
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(statement);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const order = ['channels', 'artists', 'songs', 'song-stats', 'streams', 'misc'];
const manifest = [];
for (const [orderIndex, group] of order.entries()) {
  const groupStatements = groups.get(group) || [];
  if (!groupStatements.length) continue;
  const files = writeChunks(group, orderIndex + 1, groupStatements);
  for (const file of files) manifest.push({ file, statements: groupStatements.length });
}

const readme = [
  '# D1 Console Seed Chunks',
  '',
  'Run `../../schema.sql` first, then paste these files into the D1 Console in file-name order.',
  '',
  'These chunks intentionally omit `BEGIN TRANSACTION` and `COMMIT` so each file can be run independently.',
  '',
  ...manifest.map((item) => `- ${item.file}`),
  '',
].join('\n');
fs.writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf8');

console.log(`Wrote ${manifest.length} console chunks to ${outputDir}`);
