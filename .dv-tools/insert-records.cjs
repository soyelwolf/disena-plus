#!/usr/bin/env node

// Generic Dataverse record inserter.
// Usage: node insert-records.cjs <envUrl> <tableLogicalName> <inputJsonPath> <idKeyField> <outputMapPath> [--lookup fieldName=lookupMapPath:targetLogicalCollection:targetLookupAttr]
//
// inputJsonPath: JSON array of plain objects, e.g. [{ "IdCursoText": "C71", "NombreCurso": "...", "Ciclo": "5", "PermiteConsignas": true }, ...]
// Each key is PascalCase; it is lowercased and prefixed with "dpl_" to build the Dataverse column logical name.
// Column types are read from .datamodel-manifest.json (in project root, two levels up from this script) to coerce
// values (Integer/Decimal -> Number, DateTime -> ISO string, others -> as-is).
//
// idKeyField: which input field's value to use as the key in the output id map (e.g. "IdCursoText").
// outputMapPath: where to write { "<idKeyField value>": "<new record GUID>", ... }
//
// --lookup fieldName=lookupMapPath:targetCollectionName
//   For a field in the input JSON that holds a natural key (e.g. "IdCursoText" on a Unidad record referencing its
//   parent Curso), resolve it through a previously-written id map file, then bind it as
//   "<dpl_fieldNameId>@odata.bind": "/<targetCollectionName>(<guid>)" instead of sending it as a plain column.
//   Can be repeated for multiple lookups.

const fs = require('fs');
const path = require('path');
const { getAuthToken, makeRequest } = require('./lib/validation-helpers.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const envUrl = args[0].replace(/\/+$/, '');
  const table = args[1];
  const inputPath = args[2];
  const idKeyField = args[3];
  const outputMapPath = args[4];
  const lookups = [];
  const excludeFields = new Set();
  for (let i = 5; i < args.length; i++) {
    if (args[i] === '--lookup') {
      const fieldName = args[++i];
      const mapPath = args[++i];
      const targetCollection = args[++i];
      const lookupAttr = args[++i];
      lookups.push({ fieldName, mapPath, targetCollection, lookupAttr });
    } else if (args[i] === '--exclude') {
      excludeFields.add(args[++i]);
    }
  }
  return { envUrl, table, inputPath, idKeyField, outputMapPath, lookups, excludeFields };
}

function loadManifestColumnTypes(table) {
  const manifestPath = path.join(__dirname, '..', '.datamodel-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tableDef = manifest.tables.find((t) => t.logicalName === table);
  const types = {};
  if (tableDef) {
    for (const col of tableDef.columns) types[col.logicalName] = col.type;
  }
  return types;
}

function toColumnName(fieldName) {
  return 'dpl_' + fieldName.toLowerCase();
}

function coerceValue(type, value) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'Integer' || type === 'Decimal') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'Boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === 'True' || value === '1';
  }
  if (type === 'DateTime') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return String(value);
}

async function main() {
  const { envUrl, table, inputPath, idKeyField, outputMapPath, lookups, excludeFields } = parseArgs();
  const columnTypes = loadManifestColumnTypes(table);
  const records = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const recordList = Array.isArray(records) ? records : [records];

  const lookupMaps = {};
  for (const lu of lookups) {
    lookupMaps[lu.fieldName] = { map: JSON.parse(fs.readFileSync(lu.mapPath, 'utf8')), targetCollection: lu.targetCollection, lookupAttr: lu.lookupAttr };
  }

  let token = getAuthToken(envUrl);
  if (!token) {
    process.stderr.write('Failed to get Azure CLI token.\n');
    process.exit(1);
  }

  const idMap = {};
  let created = 0, failed = 0;

  for (const rec of recordList) {
    const payload = {};
    for (const [key, value] of Object.entries(rec)) {
      if (excludeFields.has(key)) continue;
      if (lookupMaps[key]) {
        const { map, targetCollection, lookupAttr } = lookupMaps[key];
        const guid = map[value];
        if (!guid) {
          process.stderr.write(`WARN: no lookup match for ${key}=${value}, skipping bind\n`);
          continue;
        }
        payload[`${lookupAttr}@odata.bind`] = `/${targetCollection}(${guid})`;
        continue;
      }
      const col = toColumnName(key);
      const type = columnTypes[col] || 'String';
      const coerced = coerceValue(type, value);
      if (coerced !== null) payload[col] = coerced;
    }

    const res = await makeRequest({
      url: `${envUrl}/api/data/v9.2/${table}s`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      includeHeaders: true,
      timeout: 30000,
    });

    if (res.statusCode === 204 || res.statusCode === 201) {
      const loc = res.headers && (res.headers['odata-entityid'] || res.headers['OData-EntityId']);
      const match = loc && loc.match(/\(([0-9a-fA-F-]{36})\)/);
      const guid = match ? match[1] : null;
      if (guid && idKeyField && rec[idKeyField] !== undefined) idMap[rec[idKeyField]] = guid;
      created++;
    } else {
      failed++;
      process.stderr.write(`FAIL (${res.statusCode}) for ${idKeyField}=${rec[idKeyField]}: ${res.body || res.error}\n`);
    }
  }

  fs.writeFileSync(outputMapPath, JSON.stringify(idMap, null, 2));
  console.log(JSON.stringify({ table, created, failed, total: recordList.length, mapWritten: outputMapPath }));
}

main();
