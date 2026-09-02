const LIFTLINE_SYNC_TOKEN = 'replace-with-a-long-random-token';
const WORKOUT_SHEET_NAME = 'Workout Log';
const HEADER_ROW = 4;
const COLUMN_COUNT = 18;

function doGet() {
  return jsonResponse({ ok: true, service: 'Liftline Google Sheet sync' });
}

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    const payload = JSON.parse(event && event.postData ? event.postData.contents : '{}');
    if (!secureTokenMatches(String(payload.token || ''), LIFTLINE_SYNC_TOKEN)) {
      return jsonResponse({ ok: false, error: 'Unauthorized.' });
    }

    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (entries.length === 0) return jsonResponse({ ok: true, synced: 0 });

    lock.waitLock(10000);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(WORKOUT_SHEET_NAME);
    if (!sheet) throw new Error('Workout Log sheet not found.');

    const firstDataRow = HEADER_ROW + 1;
    const rowCount = Math.max(0, sheet.getLastRow() - HEADER_ROW);
    if (rowCount === 0) throw new Error('Workout Log has no exercise rows.');

    const rows = sheet.getRange(firstDataRow, 1, rowCount, COLUMN_COUNT).getValues();
    const rowByKey = {};
    rows.forEach(function (row, index) {
      rowByKey[entryKey(row[0], row[1], row[16])] = firstDataRow + index;
    });

    entries.forEach(function (entry) {
      const rowNumber = rowByKey[entryKey(entry.week, entry.day, entry.exerciseOrder)];
      if (!rowNumber) {
        throw new Error('No matching Workout Log row for week ' + entry.week + ', day ' + entry.day + ', exercise ' + entry.exerciseOrder + '.');
      }

      const completedAt = entry.completedAt ? new Date(entry.completedAt) : new Date();
      sheet.getRange(rowNumber, 3).setValue(completedAt);
      sheet.getRange(rowNumber, 6, 1, 7).setValues([[
        cellValue(entry.set1Weight), cellValue(entry.set1Reps),
        cellValue(entry.set2Weight), cellValue(entry.set2Reps),
        cellValue(entry.set3Weight), cellValue(entry.set3Reps),
        cellValue(entry.rir),
      ]]);
      sheet.getRange(rowNumber, 15).setValue(String(entry.notes || ''));
      sheet.getRange(rowNumber, 18).setValue(entry.completed ? 'Yes' : '');
    });

    SpreadsheetApp.flush();
    return jsonResponse({ ok: true, synced: entries.length });
  } catch (error) {
    return jsonResponse({ ok: false, error: error && error.message ? error.message : String(error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function entryKey(week, day, exerciseOrder) {
  return Number(week) + '|' + String(day || '').trim().toUpperCase() + '|' + Number(exerciseOrder);
}

function cellValue(value) {
  return value === null || value === undefined || value === '' ? '' : Number(value);
}

function secureTokenMatches(candidate, expected) {
  const candidateDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, candidate);
  const expectedDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected);
  if (candidateDigest.length !== expectedDigest.length) return false;
  let difference = 0;
  for (let index = 0; index < candidateDigest.length; index += 1) {
    difference |= candidateDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
