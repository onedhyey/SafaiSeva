// Real-Postgres test harness for the SQL layer (migrations, decision functions, views).
//
// Uses TEST_DATABASE_URL when set (CI: a postgres service container). Otherwise starts a
// throwaway local cluster under the OS temp dir with the Postgres binaries on PATH or from
// Homebrew, and leaves it running between test runs. Each test file gets its own fresh
// database with the Supabase shim + every migration applied, and drops it at the end.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const MIGRATIONS = path.join(root, 'supabase', 'migrations');

const LOCAL_PORT = 54329;
const LOCAL_DIR = path.join(tmpdir(), 'safaiseva-test-pg');

function pgBin(name) {
  const candidates = [
    process.env.PG_BIN && path.join(process.env.PG_BIN, name),
    '/opt/homebrew/opt/postgresql@17/bin/' + name,
    '/opt/homebrew/opt/postgresql@16/bin/' + name,
    '/usr/lib/postgresql/17/bin/' + name,
    '/usr/lib/postgresql/16/bin/' + name,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return name; // fall back to PATH
}

function ensureLocalServer() {
  const data = path.join(LOCAL_DIR, 'data');
  if (!existsSync(path.join(data, 'PG_VERSION'))) {
    mkdirSync(LOCAL_DIR, { recursive: true });
    execFileSync(pgBin('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'], {
      stdio: 'ignore',
    });
  }
  try {
    execFileSync(pgBin('pg_isready'), ['-h', LOCAL_DIR, '-p', String(LOCAL_PORT)], { stdio: 'ignore' });
  } catch {
    execFileSync(
      pgBin('pg_ctl'),
      [
        '-D', data,
        '-l', path.join(LOCAL_DIR, 'server.log'),
        '-o', `-p ${LOCAL_PORT} -k ${LOCAL_DIR} -c listen_addresses=''`,
        '-w', 'start',
      ],
      { stdio: 'ignore' }
    );
  }
  return { host: LOCAL_DIR, port: LOCAL_PORT, user: 'postgres', database: 'postgres' };
}

function adminConfig() {
  if (process.env.TEST_DATABASE_URL) return { connectionString: process.env.TEST_DATABASE_URL };
  return ensureLocalServer();
}

function withDatabase(cfg, database) {
  if (cfg.connectionString) {
    const u = new URL(cfg.connectionString);
    u.pathname = '/' + database;
    return { connectionString: u.toString() };
  }
  return { ...cfg, database };
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(MIGRATIONS, f));
}

/**
 * Create a fresh database with the shim + all migrations (and optionally supabase/seed.sql).
 * Returns { pool, query, drop }.
 */
export async function freshDb({ seed = false } = {}) {
  const base = adminConfig();
  const name = `ss_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const admin = new pg.Client(base);
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const pool = new pg.Pool({ ...withDatabase(base, name), max: 10 });
  const files = [path.join(here, 'supabase-shim.sql'), ...migrationFiles()];
  if (seed) files.push(path.join(root, 'supabase', 'seed.sql'));
  for (const f of files) {
    try {
      await pool.query(readFileSync(f, 'utf8'));
    } catch (e) {
      await pool.end();
      throw new Error(`applying ${path.relative(root, f)} failed: ${e.message}`);
    }
  }

  return {
    pool,
    name,
    config: withDatabase(base, name),
    query: (text, params) => pool.query(text, params),
    async drop() {
      await pool.end();
      const c = new pg.Client(base);
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

// --- tiny runner matching the style of the existing tests/*.test.mjs -------------------
let failed = 0;
export async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e?.message ?? e}`);
  }
}
export function done() {
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  if (failed) process.exitCode = 1;
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`);
}
export async function rejects(promise, pattern, msg) {
  try {
    await promise;
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`${msg}: wrong error "${e.message}"`);
    return;
  }
  throw new Error(`${msg}: expected an error`);
}
