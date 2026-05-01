import { browser } from "$app/environment";
import { Capacitor } from "@capacitor/core";
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { createId } from "$lib/domain/ids";
import { nowMs } from "$lib/domain/time";

const DB_NAME = "logit";
const DB_VERSION = 1;

let sqlite: SQLiteConnection | null = null;
let db: SQLiteDBConnection | null = null;

function isNative() {
  return Capacitor.isNativePlatform();
}

export async function initSqlite(): Promise<void> {
  if (!browser) return;
  if (!isNative()) return;

  if (!sqlite) sqlite = new SQLiteConnection(CapacitorSQLite);

  try {
    const consistent = await sqlite.checkConnectionsConsistency();
    if (!consistent.result) await sqlite.closeAllConnections();
  } catch {
    // Plugin not fully registered yet on this boot — close all and continue
    try { await sqlite.closeAllConnections(); } catch {}
  }

  const has = await sqlite.isConnection(DB_NAME, false);
  db = has.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        DB_VERSION,
        false,
      );

  await db.open();
  await createSchemaAndSeed(db);
}

export function getDb(): SQLiteDBConnection {
  if (!db) throw new Error("SQLite not initialized. Call initSqlite() first.");
  return db;
}

async function createSchemaAndSeed(db: SQLiteDBConnection): Promise<void> {
  await db.execute(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS set_types (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS splits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS split_days (
      id TEXT PRIMARY KEY NOT NULL,
      split_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      name TEXT NULL,
      FOREIGN KEY (split_id) REFERENCES splits(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_split_days_unique_order
      ON split_days(split_id, order_index);

    CREATE TABLE IF NOT EXISTS planned_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      day_id TEXT NOT NULL,
      block_type TEXT NOT NULL DEFAULT 'strength',
      order_index INTEGER NOT NULL,
      exercise_name TEXT NULL,
      exercise_id TEXT NULL,
      target_sets INTEGER NULL,
      target_reps INTEGER NULL,
      target_weight REAL NULL,
      activity_name TEXT NULL,
      FOREIGN KEY (day_id) REFERENCES split_days(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_planned_blocks_unique_order
      ON planned_blocks(day_id, order_index);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      exercise_id TEXT NULL,
      exercise_name TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_exercises_unique_order
      ON session_exercises(session_id, order_index);

    CREATE TABLE IF NOT EXISTS session_sets (
      id TEXT PRIMARY KEY NOT NULL,
      exercise_entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      set_type TEXT NOT NULL,
      reps INTEGER NOT NULL,
      weight REAL NOT NULL,
      note TEXT NULL,
      FOREIGN KEY (exercise_entry_id) REFERENCES session_exercises(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_sets_unique_order
      ON session_sets(exercise_entry_id, order_index);

    CREATE TABLE IF NOT EXISTS session_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      block_type TEXT NOT NULL DEFAULT 'strength',
      order_index INTEGER NOT NULL,
      data TEXT NOT NULL DEFAULT '{}'
    );

    -- extra indexes for common reads
    CREATE INDEX IF NOT EXISTS idx_sessions_started
      ON sessions(started_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_session_exercises_session
      ON session_exercises(session_id, order_index);

    CREATE INDEX IF NOT EXISTS idx_session_sets_ex_entry
      ON session_sets(exercise_entry_id, order_index);

    CREATE INDEX IF NOT EXISTS idx_exercises_name_nocase
      ON exercises(name COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_session_blocks_session
      ON session_blocks(session_id, order_index);
  `);

  await migrateSessionSets(db);
  await migrateExercises(db);
  await migrateExercisesToBlocks(db);
  await seedSetTypes(db);
  await seedExercises(db);
}

async function migrateExercisesToBlocks(db: SQLiteDBConnection): Promise<void> {
  const done = await db.query(`SELECT 1 FROM meta WHERE key = 'blocks_migrated_v1'`, []);
  if ((done.values?.length ?? 0) > 0) return;

  // Convert each session_exercise row into a session_blocks row with JSON data
  const exRes = await db.query(
    `SELECT id, session_id, order_index, exercise_id, exercise_name FROM session_exercises`,
    [],
  );
  const exRows = (exRes.values ?? []) as any[];

  for (const ex of exRows) {
    const setsRes = await db.query(
      `SELECT id, order_index, set_type, reps, weight, note, completed,
              rest_duration_ms, rest_started_at_ms
       FROM session_sets WHERE exercise_entry_id = ?`,
      [ex.id],
    );
    const sets = ((setsRes.values ?? []) as any[]).map((s) => ({
      id: s.id,
      setType: s.set_type ?? "normal",
      reps: s.reps ?? 0,
      weight: s.weight ?? 0,
      note: s.note ?? null,
      orderIndex: s.order_index ?? 0,
      completed: s.completed === 1,
      restDurationMs: s.rest_duration_ms ?? undefined,
      restStartedAtMs: s.rest_started_at_ms ?? null,
    }));

    const data = JSON.stringify({
      exerciseName: ex.exercise_name,
      exerciseId: ex.exercise_id ?? undefined,
      sets,
    });

    await db.run(
      `INSERT OR IGNORE INTO session_blocks(id, session_id, block_type, order_index, data)
       VALUES(?, ?, 'strength', ?, ?)`,
      [ex.id, ex.session_id, ex.order_index, data],
    );
  }

  await db.run(
    `INSERT INTO meta(key, value) VALUES('blocks_migrated_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`,
    [],
  );
}

async function migrateExercises(db: SQLiteDBConnection): Promise<void> {
  const additions = [
    "ALTER TABLE exercises ADD COLUMN notes TEXT NULL",
    "ALTER TABLE exercises ADD COLUMN is_core INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of additions) {
    try {
      await db.run(sql, []);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

async function migrateSessionSets(db: SQLiteDBConnection): Promise<void> {
  const additions = [
    "ALTER TABLE session_sets ADD COLUMN completed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE session_sets ADD COLUMN rest_duration_ms INTEGER NULL",
    "ALTER TABLE session_sets ADD COLUMN rest_started_at_ms INTEGER NULL",
  ];
  for (const sql of additions) {
    try {
      await db.run(sql, []);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

async function seedSetTypes(db: SQLiteDBConnection): Promise<void> {
  const res = await db.query(`SELECT 1 FROM set_types LIMIT 1`, []);
  if ((res.values?.length ?? 0) > 0) return;

  const rows = [
    { code: "normal", label: "Normal", sort: 0 },
    { code: "warmup", label: "Warm-up", sort: 1 },
    { code: "dropset", label: "Drop set", sort: 2 },
    { code: "amrap", label: "AMRAP", sort: 3 },
    { code: "failure", label: "To failure", sort: 4 },
  ] as const;

  for (const r of rows) {
    await db.run(
      `INSERT INTO set_types(id, code, label, sort_order) VALUES(?, ?, ?, ?)`,
      [createId("settype"), r.code, r.label, r.sort],
    );
  }
}

const CORE_EXERCISE_NAMES = [
    "Bench Press",
    "Incline Bench Press",
    "Squat",
    "Front Squat",
    "Deadlift",
    "Romanian Deadlift",
    "Overhead Press",
    "Pull-Up",
    "Lat Pulldown",
    "Barbell Row",
    "Dumbbell Row",
    "Chest Fly",
    "Lateral Raise",
    "Rear Delt Fly",
    "Bicep Curl",
    "Hammer Curl",
    "Tricep Pushdown",
    "Skullcrusher",
    "Leg Press",
    "Leg Curl",
    "Leg Extension",
    "Calf Raise",
    "Plank",
    "Hanging Leg Raise",
    "Machine French Press",
    "Pec Deck",
    "JM Press",
    "T-Bar Row",
    "Hip Abduction",
    "Hip Adduction",
    "Machine Back Extension",
];

async function seedExercises(db: SQLiteDBConnection): Promise<void> {
  const res = await db.query(`SELECT 1 FROM exercises LIMIT 1`, []);
  if ((res.values?.length ?? 0) > 0) {
    // Mark known core exercises by name for existing installs
    const placeholders = CORE_EXERCISE_NAMES.map(() => "?").join(", ");
    await db.run(
      `UPDATE exercises SET is_core = 1 WHERE name IN (${placeholders})`,
      CORE_EXERCISE_NAMES,
    );
    return;
  }

  for (const name of CORE_EXERCISE_NAMES) {
    await db.run(
      `INSERT INTO exercises(id, name, notes, is_core, created_at_ms) VALUES(?, ?, NULL, 1, 0)`,
      [createId("exdb"), name],
    );
  }
}
