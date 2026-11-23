const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_INPUT_FILE = path.join(PROJECT_ROOT, 'db', 'aotrunitdata');
const INPUT_FILE =
  process.env.UNIT_DATA_FILE ||
  (fs.existsSync(DEFAULT_INPUT_FILE)
    ? DEFAULT_INPUT_FILE
    : path.join(__dirname, 'aotrunitdata'));

const FACTION_IDS = Object.freeze({
  Gondor: 1,
  Rohan: 2,
  Erebor: 3,
  Rivendell: 4,
  Lothlorien: 5,
  'Woodland Realm': 6,
  Isengard: 7,
  Mordor: 8,
  'Misty Mountains': 9,
  'Dol Guldur': 10,
  Haradwaith: 11,
});

const LEGACY_NAME_ALIASES = Object.freeze({
  'Lossarnach Axemen': ['Lossonarch Axemen'],
  'Soldiers of Minas Tirith': ['Anorien Soldiers'],
});

const INPUT_FIELDS = new Map([
  ['buildtime', 'BUILD_TIME'],
  ['hp', 'HP'],
  ['armorset', 'ARMORSET'],
  ['weaponset', 'WEAPONSET'],
  ['hordespeed', 'HORDESPEED'],
  ['special', 'SPECIAL'],
  ['experiencelevel', 'EXPERIENCE'],
]);

const COLUMN_LIMITS = Object.freeze({
  NAME: 200,
  ARMORSET: 100,
  EXPERIENCE: 100,
  WEAPONSET: 65535,
  SPECIAL: 65535,
});

const TEXT_COLUMNS = Object.freeze(['WEAPONSET', 'SPECIAL']);

function normalizeName(name) {
  return name.trim().toLocaleLowerCase();
}

function readEnvFile() {
  const envFile = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envFile)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function nextNonEmptyLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return index;
    }
  }
  return -1;
}

function isRecordStart(lines, index) {
  if (!lines[index].trim() || lines[index].includes('=')) {
    return false;
  }

  const next = nextNonEmptyLine(lines, index + 1);
  return next >= 0 && /^Cost\s*=/i.test(lines[next].trim());
}

function parseInteger(value, field, lineNumber) {
  const trimmed = value.trim();
  if (/^n\/a$/i.test(trimmed)) {
    return null;
  }
  if (/^free$/i.test(trimmed)) {
    return 0;
  }

  const match = trimmed.match(/^\d+/);
  if (!match) {
    throw new Error(`Line ${lineNumber}: invalid ${field} value "${value}"`);
  }
  return Number(match[0]);
}

function parseCost(value, unit, lineNumber) {
  const baseCost = value.split(',')[0].trim();
  if (/^n\/a\b/i.test(baseCost)) {
    unit.fields.COST = null;
  } else {
    unit.fields.COST = parseInteger(baseCost, 'Cost', lineNumber);
  }

  const commandPoints = value.match(/,\s*(\d+)\s*CP\b/i);
  if (commandPoints) {
    unit.fields.COMMAND_POINTS = Number(commandPoints[1]);
  }

  const bounty = value.match(/bounty\s+value\s*=\s*(\d+)/i);
  if (bounty) {
    unit.fields.BOUNTY_VAL = Number(bounty[1]);
  }
}

function appendWeaponLine(unit, line) {
  const continuation = line.trim().replace(/^\d+\s*(?:=\s*)?/, '');
  if (!continuation) {
    return;
  }

  unit.fields.WEAPONSET = unit.fields.WEAPONSET
    ? `${unit.fields.WEAPONSET}; ${continuation}`
    : continuation;
}

function validateUnit(unit) {
  const issues = [];
  for (const [field, limit] of Object.entries(COLUMN_LIMITS)) {
    const value = unit.fields[field];
    if (typeof value === 'string' && value.length > limit) {
      issues.push(
        `${unit.section} / ${unit.name}: ${field} is ${value.length} characters; ` +
          `the database column limit is ${limit}`,
      );
    }
  }
  return issues;
}

function assertFitsSchema(units) {
  const issues = units.flatMap((unit) => unit.schemaIssues);
  if (issues.length) {
    throw new Error(
      `Some values exceed the current database column sizes:\n- ${issues.join('\n- ')}`,
    );
  }
}

async function getRequiredColumnChanges(connection, units) {
  const [columns] = await connection.query('SHOW COLUMNS FROM units');
  const databaseColumns = new Map(columns.map((column) => [column.Field, column.Type]));
  const changes = [];

  for (const field of TEXT_COLUMNS) {
    const type = databaseColumns.get(field);
    if (!type) {
      throw new Error(`The units table is missing the expected ${field} column`);
    }

    const maxLength = units.reduce((max, unit) => {
      const value = unit.fields[field];
      return typeof value === 'string' ? Math.max(max, value.length) : max;
    }, 0);
    const varcharLength = type.match(/^varchar\((\d+)\)/i);
    if (varcharLength && maxLength > Number(varcharLength[1])) {
      changes.push({
        field,
        from: type,
        to: 'TEXT',
      });
    }
  }
  return changes;
}

async function widenColumns(connection, changes) {
  if (!changes.length) {
    return;
  }

  const definitions = changes
    .map(({ field }) => `MODIFY COLUMN \`${field}\` TEXT NULL`)
    .join(', ');
  await connection.query(`ALTER TABLE units ${definitions}`);
  for (const change of changes) {
    console.log(`Expanded units.${change.field}: ${change.from} -> ${change.to}`);
  }
}

function parseUnitData(contents) {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
  const factionIds = new Map(
    Object.entries(FACTION_IDS).map(([name, id]) => [normalizeName(name), id]),
  );
  const units = [];
  const seen = new Set();
  let section = null;
  let currentUnit = null;
  let currentField = null;

  function finishUnit() {
    if (!currentUnit) {
      return;
    }
    currentUnit.schemaIssues = validateUnit(currentUnit);
    const key = `${currentUnit.factionId}:${normalizeName(currentUnit.name)}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate unit "${currentUnit.name}" in ${currentUnit.section}`);
    }
    seen.add(key);
    units.push(currentUnit);
    currentUnit = null;
    currentField = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    const factionId = factionIds.get(normalizeName(line));
    if (factionId !== undefined && !line.includes('=')) {
      finishUnit();
      section = line;
      continue;
    }

    if (isRecordStart(lines, index)) {
      finishUnit();
      if (!section) {
        throw new Error(`Line ${index + 1}: unit "${line}" has no faction section`);
      }
      currentUnit = {
        name: line,
        section,
        factionId: factionIds.get(normalizeName(section)),
        fields: {},
      };
      currentField = null;
      continue;
    }

    if (!currentUnit) {
      throw new Error(`Line ${index + 1}: unexpected content "${line}"`);
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) {
      if (currentField === 'WEAPONSET') {
        appendWeaponLine(currentUnit, line);
      } else if (normalizeName(line) === 'weaponset') {
        currentField = 'WEAPONSET';
      } else {
        throw new Error(`Line ${index + 1}: unexpected continuation "${line}"`);
      }
      continue;
    }

    const key = normalizeName(line.slice(0, equalsIndex)).replace(/\s+/g, '');
    const value = line.slice(equalsIndex + 1).trim();
    if (!INPUT_FIELDS.has(key) && key !== 'cost' && currentField === 'WEAPONSET') {
      appendWeaponLine(currentUnit, line);
      continue;
    }

    currentField = INPUT_FIELDS.get(key) || null;

    if (key === 'cost') {
      parseCost(value, currentUnit, index + 1);
    } else if (currentField === 'BUILD_TIME' || currentField === 'HP' ||
               currentField === 'HORDESPEED') {
      if (value) {
        currentUnit.fields[currentField] = parseInteger(value, currentField, index + 1);
      }
    } else if (currentField === 'SPECIAL') {
      currentUnit.fields.SPECIAL = value;
    } else if (currentField && value) {
      currentUnit.fields[currentField] = value;
    }
  }

  finishUnit();
  if (units.length === 0) {
    throw new Error('No unit entries were found in db/aotrunitdata');
  }
  return units;
}

function getLegacyNames(name) {
  return LEGACY_NAME_ALIASES[name] || [];
}

function planChanges(units, existingRows) {
  return units.map((unit) => {
    const candidates = new Set(
      [unit.name, ...getLegacyNames(unit.name)].map(normalizeName),
    );
    const matches = existingRows.filter(
      (row) =>
        row.FACTION_ID === unit.factionId &&
        candidates.has(normalizeName(row.NAME || '')),
    );

    if (matches.length > 1) {
      throw new Error(
        `Multiple existing rows match "${unit.name}" in faction ${unit.factionId}`,
      );
    }

    return {
      ...unit,
      action: matches.length === 1 ? 'update' : 'insert',
      unitId: matches.length === 1 ? matches[0].UNIT_ID : null,
    };
  });
}

function printPlan(plan, schemaChanges) {
  const inserts = plan.filter((unit) => unit.action === 'insert').length;
  const updates = plan.length - inserts;
  const factionCounts = new Map();
  for (const unit of plan) {
    factionCounts.set(unit.section, (factionCounts.get(unit.section) || 0) + 1);
  }

  console.log(`Parsed ${plan.length} units (${inserts} inserts, ${updates} updates).`);
  for (const [faction, id] of Object.entries(FACTION_IDS)) {
    const count = factionCounts.get(faction);
    if (count) {
      console.log(`Faction ${id} (${faction}): ${count} units`);
    }
  }
  for (const change of schemaChanges) {
    console.log(
      `Schema change required: units.${change.field} ${change.from} -> ${change.to}`,
    );
  }
  for (const unit of plan) {
    const id = unit.unitId === null ? '' : ` UNIT_ID=${unit.unitId}`;
    console.log(`${unit.action.toUpperCase()} [${unit.section}] ${unit.name}${id}`);
  }
}

async function applyPlan(connection, plan) {
  await connection.beginTransaction();
  try {
    for (const unit of plan) {
      const fields = {
        NAME: unit.name,
        ...unit.fields,
        FACTION_ID: unit.factionId,
      };
      const columns = Object.keys(fields);
      const values = columns.map((column) => fields[column]);

      if (unit.action === 'insert') {
        const names = columns.map((column) => `\`${column}\``).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        await connection.execute(
          `INSERT INTO units (${names}) VALUES (${placeholders})`,
          values,
        );
      } else {
        const assignments = columns
          .filter((column) => column !== 'NAME')
          .map((column) => `\`${column}\` = ?`)
          .join(', ');
        const updateValues = columns
          .filter((column) => column !== 'NAME')
          .map((column) => fields[column]);
        updateValues.push(unit.unitId);
        await connection.execute(
          `UPDATE units SET NAME = ?, ${assignments} WHERE UNIT_ID = ?`,
          [unit.name, ...updateValues],
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const allowedArgs = new Set(['--apply', '--dry-run', '--parse-only']);
  const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
  if (unknownArgs.length) {
    throw new Error(`Unknown option(s): ${unknownArgs.join(', ')}`);
  }
  if (args.includes('--apply') && args.includes('--parse-only')) {
    throw new Error('--apply and --parse-only cannot be used together');
  }

  const units = parseUnitData(fs.readFileSync(INPUT_FILE, 'utf8'));
  if (args.includes('--parse-only')) {
    const counts = new Map();
    for (const unit of units) {
      counts.set(unit.section, (counts.get(unit.section) || 0) + 1);
    }
    console.log(`Parsed ${units.length} units from ${path.relative(PROJECT_ROOT, INPUT_FILE)}.`);
    for (const [faction, id] of Object.entries(FACTION_IDS)) {
      if (counts.has(faction)) {
        console.log(`Faction ${id} (${faction}): ${counts.get(faction)} units`);
      }
    }
    const schemaIssues = units.flatMap((unit) => unit.schemaIssues);
    for (const issue of schemaIssues) {
      console.warn(`[SCHEMA LIMIT] ${issue}`);
    }
    return;
  }

  assertFitsSchema(units);
  readEnvFile();
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || (process.env.DB_HOST ? 3306 : 3307)),
    user: process.env.DB_USER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE,
  });

  try {
    const [existingRows] = await connection.query(
      'SELECT UNIT_ID, NAME, FACTION_ID FROM units',
    );
    const plan = planChanges(units, existingRows);
    const schemaChanges = await getRequiredColumnChanges(connection, units);
    printPlan(plan, schemaChanges);

    if (args.includes('--apply')) {
      await widenColumns(connection, schemaChanges);
      await applyPlan(connection, plan);
      console.log('Import committed.');
    } else {
      console.log('Dry run only. Re-run with --apply to write these changes.');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
