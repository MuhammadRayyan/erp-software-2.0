// Mounted only into disposable image tests; never imported by the application or bundled operations.
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
if (process.env.ERP_CI_FIXTURE !== '1') throw new Error('Synthetic fixture creation requires an explicit CI flag.');
const root = process.env.ERP_DATA_DIR || '/app/data';
const verifying = process.argv[2] === 'verify';
const sqlite = new Database(path.join(root, 'system/system.sqlite'), { fileMustExist: true, readonly: verifying });
if (verifying) {
  const user = sqlite.prepare('SELECT name FROM user WHERE id=?').get('ci-fixture-user');
  if (!user?.name.startsWith('Synthetic hot-WAL fixture ')) throw new Error('Committed system WAL content was lost.');
  const { directory_key: key } = sqlite.prepare('SELECT directory_key FROM businesses').get();
  const directory = path.join(root, 'businesses', key);
  const business = new Database(path.join(directory, 'business.sqlite'), { fileMustExist: true, readonly: true });
  if (business.prepare('SELECT value FROM ci_snapshot_probe').get().value !== 'Committed tenant WAL') throw new Error('Committed tenant WAL content was lost.');
  if (fs.readFileSync(path.join(directory, 'attachments/fixture.txt'), 'utf8') !== 'Synthetic backup attachment') throw new Error('Backup attachment was lost.');
  business.close();
  sqlite.close();
} else if (process.argv[2] === 'hot-wal' || process.argv[2] === 'clean-wal') {
  const user = sqlite.prepare('SELECT id FROM user').all();
  if (user.length !== 1 || user[0].id !== 'ci-fixture-user') throw new Error('Refusing to crash a process using a non-fixture database.');
  sqlite.pragma('journal_mode=WAL');
  sqlite.pragma('wal_autocheckpoint=0');
  sqlite.prepare('UPDATE user SET name=? WHERE id=?').run(`Synthetic hot-WAL fixture ${randomUUID()}`, 'ci-fixture-user');
  const { directory_key: key } = sqlite.prepare('SELECT directory_key FROM businesses').get();
  const business = new Database(path.join(root, 'businesses', key, 'business.sqlite'), { fileMustExist: true });
  business.pragma('journal_mode=WAL');
  business.pragma('wal_autocheckpoint=0');
  business.exec("CREATE TABLE IF NOT EXISTS ci_snapshot_probe(value TEXT NOT NULL); DELETE FROM ci_snapshot_probe; INSERT INTO ci_snapshot_probe VALUES ('Committed tenant WAL')");
  if (process.argv[2] === 'hot-wal') process.kill(process.pid, 'SIGKILL');
  else { business.close(); sqlite.close(); }
} else {
  if (sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n !== 0) throw new Error('Fixture database must be empty.');
  const directoryKey = randomUUID(), businessId = randomUUID(), now = new Date().toISOString();
  sqlite.prepare('INSERT INTO user (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,1,?,?)')
    .run('ci-fixture-user', 'Synthetic fixture', 'fixture@example.invalid', Date.now(), Date.now());
  sqlite.prepare('INSERT INTO businesses (id,name,country,currency,financial_year_start_month,directory_key,archived,owner_user_id,created_at,updated_at,last_opened_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)')
    .run(businessId, 'Synthetic backup fixture', 'AE', 'AED', 1, directoryKey, 'ci-fixture-user', now, now, now);
  sqlite.prepare('INSERT INTO business_memberships (id,business_id,user_id,role,modules_json,created_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), businessId, 'ci-fixture-user', 'administrator', '[]', now);
  const directory = path.join(root, 'businesses', directoryKey);
  fs.mkdirSync(path.join(directory, 'attachments'), { recursive: true });
  new Database(path.join(directory, 'business.sqlite')).close();
  fs.writeFileSync(path.join(directory, 'attachments/fixture.txt'), 'Synthetic backup attachment');
  sqlite.close();
}
