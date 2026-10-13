export const backupFileLimit = 8_000_000;
export const backupRequestLimit = 9_000_000;

// D1 limits apply to a batch's query count as well as each statement. Group
// rows through json_each so thousands of rows still restore in one transaction.
export function jsonBackupChunks(records: object[]) {
  const chunks: string[] = [];
  let rows: string[] = [],
    size = 2;
  for (const record of records) {
    const value = JSON.stringify(record);
    const bytes = new TextEncoder().encode(value).length + 1;
    if (bytes > 1_900_000) throw new Error('A backup record is too large.');
    if (size + bytes > 1_900_000 && rows.length) {
      chunks.push(`[${rows.join(',')}]`);
      rows = [];
      size = 2;
    }
    rows.push(value);
    size += bytes;
  }
  if (rows.length) chunks.push(`[${rows.join(',')}]`);
  return chunks;
}

export function jsonRestoreStatements(
  db: D1Database,
  table: string,
  fields: Record<string, string>,
  records: object[],
  conflict: string[],
  ignoreExisting = false,
  guard?: { sql: string; args: unknown[] },
) {
  const chunks = jsonBackupChunks(records);
  const columns = Object.keys(fields);
  const values = columns.map(
    (column) => `json_extract(j.value, '$.${fields[column]}')`,
  );
  const where = ignoreExisting
    ? `NOT EXISTS (SELECT 1 FROM ${table} old WHERE ${conflict.map((column) => `old.${column} = json_extract(j.value, '$.${fields[column]}')`).join(' AND ')})`
    : '1';
  const guardedWhere = guard ? `(${where}) AND (${guard.sql})` : where;
  const update = ignoreExisting
    ? ''
    : ` ON CONFLICT(${conflict.join(',')}) DO UPDATE SET ${columns
        .filter((column) => !conflict.includes(column))
        .map((column) => `${column}=excluded.${column}`)
        .join(',')}`;
  return chunks.map((chunk) =>
    db
      .prepare(
        `INSERT INTO ${table} (${columns.join(',')}) SELECT ${values.join(',')} FROM json_each(?) j WHERE ${guardedWhere}${update}`,
      )
      .bind(chunk, ...(guard?.args ?? [])),
  );
}
