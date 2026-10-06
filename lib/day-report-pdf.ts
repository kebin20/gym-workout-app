// This entire module (including the PDF/font engine) is loaded on export only.
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  reportMetrics,
  reportSets,
  reportWeek,
  isTimedEntry,
  type DayReport,
} from './day-report';

const blue = rgb(0.14, 0.32, 0.91);
const ink = rgb(0.04, 0.09, 0.2);
const muted = rgb(0.33, 0.4, 0.51);
const pale = rgb(0.93, 0.96, 1);
const fmt = (value: number) =>
  new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value);
const dateLabel = (value: string | null) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : 'Date unavailable';
export function reportFontPath(report: DayReport) {
  return /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/u.test(
    JSON.stringify(report.records),
  )
    ? '/fonts/NotoSansJP.ttf'
    : '/fonts/NotoSans-Regular.ttf';
}

export async function createDayReportPdf(
  report: DayReport,
  fontBytes: Uint8Array,
  generatedAt = new Date(),
  unicodeFontBytes?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Embed the static font intact: subsetting large CJK fonts can lose glyphs in
  // PDF readers. Fonts still load only when a report is requested.
  const font = await pdf.embedFont(fontBytes);
  const characters = new Set(font.getCharacterSet());
  const unicodeFont = unicodeFontBytes
    ? await pdf.embedFont(unicodeFontBytes)
    : font;
  const unicodeCharacters = new Set(unicodeFont.getCharacterSet());
  const pickFont = (char: string) =>
    characters.has(char.codePointAt(0)!) ? font : unicodeFont;
  const runs = (value: string) => {
    const result: { text: string; font: typeof font }[] = [];
    for (const char of value) {
      const chosen = pickFont(char),
        previous = result.at(-1);
      if (previous?.font === chosen) previous.text += char;
      else result.push({ text: char, font: chosen });
    }
    return result;
  };
  const measure = (value: string, size: number) =>
    runs(value).reduce(
      (sum, run) => sum + run.font.widthOfTextAtSize(run.text, size),
      0,
    );
  let replacedSymbols = false;
  const safeText = (value: string) =>
    [...value.replace(/[\u2010-\u2015]/gu, '-').replace(/\u00a0/gu, ' ')]
      .map((char) => {
        if (
          characters.has(char.codePointAt(0)!) ||
          unicodeCharacters.has(char.codePointAt(0)!) ||
          char === '\n'
        )
          return char;
        replacedSymbols = true;
        return '?';
      })
      .join('');
  let page!: PDFPage;
  let y = 0;
  const width = 595.28,
    height = 841.89,
    margin = 42,
    content = width - margin * 2;
  const newPage = () => {
    page = pdf.addPage();
    page.setSize(width, height);
    page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: blue });
    page.drawText(`LIFTLINE / DAY ${report.day}`, {
      x: margin,
      y: height - 36,
      size: 9,
      font,
      color: blue,
    });
    y = height - 64;
  };
  const ensure = (space: number) => {
    if (y - space < 58) newPage();
  };
  const wrap = (raw: string, maxWidth: number, size: number) => {
    const lines: string[] = [];
    for (const paragraph of safeText(raw).split('\n')) {
      let line = '';
      // Character-safe wrapping also handles Japanese and very long URLs/notes.
      for (const char of paragraph) {
        if (measure(line + char, size) > maxWidth && line) {
          const space = line.lastIndexOf(' ');
          if (space > line.length / 2) {
            lines.push(line.slice(0, space));
            line = line.slice(space + 1) + char;
          } else {
            lines.push(line);
            line = char;
          }
        } else line += char;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (value: string, size = 10, color = ink, indent = 0) => {
    for (const line of wrap(value, content - indent, size)) {
      ensure(size * 1.5);
      let x = margin + indent;
      for (const run of runs(line)) {
        page.drawText(run.text, { x, y, size, font: run.font, color });
        x += run.font.widthOfTextAtSize(run.text, size);
      }
      y -= size * 1.5;
    }
  };
  const heading = (value: string) => {
    ensure(48);
    y -= 14;
    text(value, 16, ink);
    y -= 7;
  };
  const rule = () => {
    ensure(12);
    page.drawRectangle({
      x: margin,
      y,
      width: content,
      height: 0.7,
      color: rgb(0.83, 0.87, 0.95),
    });
    y -= 15;
  };
  newPage();
  text(`Day ${report.day} - training history`, 25);
  text(
    `All saved programme sessions | Generated ${dateLabel(generatedAt.toISOString())}`,
    10,
    muted,
  );
  y -= 14;
  const cards = [
    ['Sessions recorded', String(report.sessions.length)],
    ['Exercise logs', String(report.records.length)],
    ['Loaded volume', `${fmt(report.volume)} kg`],
  ];
  for (let i = 0; i < cards.length; i++) {
    const x = margin + i * (content / 3 + 2);
    page.drawRectangle({
      x,
      y: y - 62,
      width: content / 3 - 7,
      height: 62,
      color: pale,
    });
    page.drawText(cards[i][0], {
      x: x + 12,
      y: y - 18,
      size: 9,
      font,
      color: muted,
    });
    page.drawText(cards[i][1], {
      x: x + 12,
      y: y - 44,
      size: 17,
      font,
      color: blue,
    });
  }
  y -= 85;
  text(
    'Scope: Day ' +
      report.day +
      ' across all recorded phases and weeks. Includes partial saved logs; unsaved drafts and Holiday sessions are excluded.',
    10,
    muted,
  );
  if (report.pending)
    text(
      `${report.pending} exercise log(s) are saved on this device but not yet synced.`,
      10,
      blue,
    );
  text(
    'Volume = positive repetitions x recorded load. Bodyweight and timed holds are excluded from kg volume. Session totals may reflect different exercises or equipment; they are not a direct measure of strength.',
    9,
    muted,
  );
  heading('Session volume trend');
  if (report.sessions.length) {
    // Chunk the chart instead of dropping earlier sessions or packing unreadable labels.
    for (let offset = 0; offset < report.sessions.length; offset += 12) {
      const sessions = report.sessions.slice(offset, offset + 12);
      ensure(158);
      const chartTop = y - 8,
        chartBottom = chartTop - 88;
      const maximum = Math.max(
        1,
        ...report.sessions.map((session) => session.volume),
      );
      text(`Loaded volume (kg) | scale 0 - ${fmt(maximum)}`, 9, muted);
      const slot = content / sessions.length;
      sessions.forEach((session, index) => {
        const x = margin + index * slot + slot * 0.18;
        const barHeight = (session.volume / maximum) * 65;
        page.drawRectangle({
          x,
          y: chartBottom,
          width: slot * 0.64,
          height: Math.max(1, barHeight),
          color: blue,
        });
        page.drawText(fmt(session.volume), {
          x,
          y: chartBottom + barHeight + 5,
          size: 7,
          font,
          color: muted,
        });
        page.drawText(reportWeek(session.week), {
          x,
          y: chartBottom - 15,
          size: 7,
          font,
          color: muted,
        });
      });
      y = chartBottom - 33;
    }
  } else
    text(
      'No saved sessions yet. Log a workout to build this report.',
      11,
      muted,
    );
  heading('Exercise trends');
  text(
    'First vs latest valid sets, grouped by phase and recorded exercise name. Notes below provide context for machine changes, substitutions and corrected entries.',
    9,
    muted,
  );
  y -= 8;
  for (const exercise of report.exercises) {
    ensure(86);
    text(`Phase ${exercise.phase} / ${exercise.name}`, 12, blue);
    const valid = exercise.records.filter(
      (entry) => reportMetrics(entry).workingSets > 0,
    );
    const first = valid[0],
      latest = valid.at(-1);
    if (!first || !latest)
      text('Notes-only history; no valid working sets for a trend.', 10, muted);
    else {
      const a = reportMetrics(first),
        b = reportMetrics(latest);
      text(
        `${exercise.records.length} log(s) | ${reportWeek(first.week)} to ${reportWeek(latest.week)}`,
        9,
        muted,
      );
      if (isTimedEntry(latest))
        text(
          `Total hold time: ${fmt(a.seconds)} to ${fmt(b.seconds)} seconds`,
          10,
        );
      else {
        text(
          `Top load: ${a.topWeight === null ? 'bodyweight / unrecorded' : fmt(a.topWeight) + ' kg'} to ${b.topWeight === null ? 'bodyweight / unrecorded' : fmt(b.topWeight) + ' kg'} | Reps: ${a.reps} to ${b.reps}`,
          10,
        );
        const change =
          a.volume > 0 && valid.length > 1
            ? ` (${b.volume >= a.volume ? '+' : ''}${fmt(((b.volume - a.volume) / a.volume) * 100)}%)`
            : '';
        text(
          `Session volume: ${fmt(a.volume)} to ${fmt(b.volume)} kg${change}`,
          10,
        );
      }
      if (valid.length === 1)
        text(
          'One session only; more logs are needed to establish a trend.',
          9,
          muted,
        );
    }
    y -= 8;
    rule();
  }
  newPage();
  heading('Complete session log');
  text(
    'Chronological programme order. All recorded sets and notes are included, even when an exercise was left incomplete.',
    9,
    muted,
  );
  for (const session of report.sessions) {
    ensure(132); // Keep a session heading with its first exercise, not at a page foot.
    heading(`${reportWeek(session.week)} / ${dateLabel(session.date)}`);
    text(
      `${session.records.length} exercise log(s) | Volume ${fmt(session.volume)} kg | ${session.reps} reps${session.seconds ? ` | ${session.seconds} seconds of holds` : ''}`,
      10,
      muted,
    );
    y -= 8;
    for (const entry of session.records) {
      ensure(66);
      text(`${entry.exerciseOrder}. ${entry.exercise}`, 12, blue);
      text(
        `Target: ${entry.target || 'Not recorded'} | ${entry.completed ? 'Logged' : 'Partial save'}${entry.offlinePending ? ' | Awaiting sync' : ''}${entry.rir === null ? '' : ` | RIR ${entry.rir}`}`,
        9,
        muted,
      );
      const sets = reportSets(entry);
      text(
        sets.length
          ? sets
              .map(
                (set) =>
                  `Set ${set.set}: ${set.weight === null ? '' : fmt(set.weight) + ' kg x '}${set.reps === null ? 'not recorded' : fmt(set.reps)} ${isTimedEntry(entry) ? 'sec' : 'reps'}`,
              )
              .join('  |  ')
          : 'No set values recorded.',
        10,
      );
      if (entry.notes?.trim()) text('Notes: ' + entry.notes, 10, ink, 10);
      y -= 10;
    }
    rule();
  }
  if (replacedSymbols)
    text(
      'Some symbols are shown as ?. The attached UTF-8 record file preserves the original text.',
      9,
      muted,
    );
  await pdf.attach(
    new TextEncoder().encode(JSON.stringify(report.records, null, 2)),
    `liftline-day-${report.day.toLowerCase()}-records.json`,
    {
      mimeType: 'application/json',
      description: 'Original saved logs, including full Unicode notes.',
    },
  );
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    page.drawText(`Liftline | Day ${report.day} | Personal training record`, {
      x: margin,
      y: 29,
      size: 8,
      font,
      color: muted,
    });
    page.drawText(`${i + 1} / ${pages.length}`, {
      x: width - margin - 38,
      y: 29,
      size: 8,
      font,
      color: muted,
    });
  });
  pdf.setTitle(`Liftline Day ${report.day} training report`);
  pdf.setAuthor('Liftline');
  pdf.setCreationDate(generatedAt);
  return pdf.save();
}
