// csv-fast 1.0.0 — a fast drop-in for csv-reader 1.0.0.
//
// Answers exactly as csv-reader 1.0.0 does for every input {text, header}:
// {columns, rows, errors}. The reference reads one character at a time and builds
// every field a character at a time; this reader does the same reading, but jumps
// with indexOf/slice instead of stepping: a record whose line holds no quote is
// split in one go, an unquoted field is one slice, a quoted field is one slice
// unless it holds a doubled quote or a line break. Nothing is cached from one
// run() call to the next; every answer is built fresh from its own input.
//
// Broken-row policy (csv-reader 1.0.0's, kept exactly):
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF, and a line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field that opens with a quote runs to the next quote that is not doubled,
//   "" inside it is one quote and each CRLF or lone CR inside it is read as LF;
//   what follows its closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends); a quote that never
//   closes is a literal character, and the text after it is read again as
//   unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character;
// - fields stay strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds the
//   records after it, each padded with "" (short_row, with fields: its field
//   count) or cut (long_row, with extra: the cut fields) to the first record's
//   width; each error is {code, line, row}, in the order met.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/**
 * The index of the next comma, LF or CR at or after `from`, or `n` when none
 * is left. A tight charCodeAt loop: the fields here are short, so scanning
 * them once beats three indexOf passes that each run to the next line break.
 */
function fieldEnd(text, from, n) {
  let i = from;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 44 || c === 10 || c === 13) return i;
    i++;
  }
  return n;
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (pos < n) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    // Fast path: this record's line holds no quote, so no field on it opens
    // with a quote and no field can run past the line's end. The whole
    // record is one slice split on commas.
    const lineEnd = text.indexOf('\n', pos);
    const le = lineEnd === -1 ? n : lineEnd;
    const qi = text.indexOf('"', pos);
    if (qi === -1 || qi >= le) {
      let contentEnd = le;
      if (lineEnd !== -1 && contentEnd > pos && text.charCodeAt(contentEnd - 1) === 13) contentEnd--;
      const ri = text.indexOf('\r', pos);
      if (ri === -1 || ri >= contentEnd) {
        // A line left with no characters is no record. After the blank-line
        // skip above this cannot happen, but the reference skips such a
        // record rather than filing it, so this stays a skip, not a row.
        if (contentEnd === pos) {
          if (lineEnd !== -1) {
            pos = lineEnd + 1;
            line++;
          } else {
            pos = n;
          }
          continue;
        }
        const fields = text.slice(pos, contentEnd).split(',');
        if (lineEnd !== -1) {
          pos = lineEnd + 1;
          line++;
        } else {
          pos = n;
        }
        // A line that held only stray CRs is left with no characters: no
        // record (its stray_cr errors stay). The fast path only reaches
        // here with no CR at all, so the skip above cannot trigger; the
        // record is filed here, the single place records are filed.
        if (width < 0) width = fields.length;
        if (header && columns === null) {
          columns = fields;
        } else {
          if (fields.length < width) {
            errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
            while (fields.length < width) fields.push('');
          } else if (fields.length > width) {
            errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
          }
          rows.push(fields);
        }
        continue;
      }
      // A stray CR sits inside this line: fall through to the general
      // reader, which drops it and records the error.
    }

    // General path: at least one quote sits on this record's first line.
    // A quoted field may run past the line's end, so fields are read one
    // by one until a field ends at a line break or at the end of the text.
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      let value;
      if (text.charCodeAt(pos) === 34) {
        // A field that opens with a quote.
        lastQuoted = true;
        const open = pos;
        const openLine = line;
        let q = text.indexOf('"', pos + 1);
        let parts = null;
        let seg = pos + 1;
        let close = -1;
        while (q !== -1) {
          if (text.charCodeAt(q + 1) === 34) {
            // A doubled quote: one quote, and the field runs on.
            if (parts === null) parts = [];
            parts.push(text.slice(seg, q + 1));
            seg = q + 2;
            q = text.indexOf('"', q + 2);
          } else {
            close = q;
            break;
          }
        }
        if (close === -1) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          line = openLine;
          value = '"';
          let segStart = pos;
          for (;;) {
            const stop = fieldEnd(text, pos, n);
            if (stop > segStart) {
              value += text.slice(segStart, stop);
            }
            if (stop >= n) {
              pos = n;
              ended = END;
              break;
            }
            const c = text.charCodeAt(stop);
            if (c === 44) {
              pos = stop + 1;
              ended = COMMA;
              break;
            }
            if (c === 10) {
              pos = stop + 1;
              line++;
              ended = LINE_BREAK;
              break;
            }
            if (text.charCodeAt(stop + 1) === 10) {
              pos = stop + 2;
              line++;
              ended = LINE_BREAK;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            pos = stop + 1;
            segStart = pos;
          }
          fields.push(value);
          continue;
        }
        // The content runs from pos + 1 to the closing quote, with doubled
        // quotes already folded into parts.
        const nli = text.indexOf('\n', pos + 1);
        const cri = text.indexOf('\r', pos + 1);
        const hasBreak = (nli !== -1 && nli < close) || (cri !== -1 && cri < close);
        if (parts === null) {
          value = text.slice(pos + 1, close);
        } else {
          parts.push(text.slice(seg, close));
          value = parts.join('');
        }
        if (hasBreak) {
          // Each CRLF or lone CR inside quotes is one LF, and each counts
          // one line; a lone LF counts one line as well.
          let ld = 0;
          let i = pos + 1;
          while ((i = text.indexOf('\r', i)) !== -1 && i < close) {
            ld++;
            i++;
          }
          i = pos + 1;
          while ((i = text.indexOf('\n', i)) !== -1 && i < close) {
            if (text.charCodeAt(i - 1) !== 13) ld++;
            i++;
          }
          line += ld;
          value = value.replace(/\r\n?/g, '\n');
        }
        pos = close + 1;
        if (pos >= n) {
          ended = END;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            pos++;
            ended = COMMA;
          } else if (c === 10) {
            pos++;
            line++;
            ended = LINE_BREAK;
          } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line++;
            ended = LINE_BREAK;
          } else {
            // What follows the closing quote is appended as it stands,
            // up to the next comma or line break.
            let added = 0;
            let segStart = pos;
            for (;;) {
              const stop = fieldEnd(text, pos, n);
              if (stop > segStart) {
                value += text.slice(segStart, stop);
                added += stop - segStart;
              }
              if (stop >= n) {
                pos = n;
                ended = END;
                break;
              }
              const cc = text.charCodeAt(stop);
              if (cc === 44) {
                pos = stop + 1;
                ended = COMMA;
                break;
              }
              if (cc === 10) {
                pos = stop + 1;
                line++;
                ended = LINE_BREAK;
                break;
              }
              if (text.charCodeAt(stop + 1) === 10) {
                pos = stop + 2;
                line++;
                ended = LINE_BREAK;
                break;
              }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              pos = stop + 1;
              segStart = pos;
            }
            if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
        }
      } else {
        // An unquoted field: a quote inside it is a literal character.
        lastQuoted = false;
        value = '';
        let segStart = pos;
        for (;;) {
          const stop = fieldEnd(text, pos, n);
          if (stop > segStart) value += text.slice(segStart, stop);
          if (stop >= n) {
            pos = n;
            ended = END;
            break;
          }
          const c = text.charCodeAt(stop);
          if (c === 44) {
            pos = stop + 1;
            ended = COMMA;
            break;
          }
          if (c === 10) {
            pos = stop + 1;
            line++;
            ended = LINE_BREAK;
            break;
          }
          if (text.charCodeAt(stop + 1) === 10) {
            pos = stop + 2;
            line++;
            ended = LINE_BREAK;
            break;
          }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          pos = stop + 1;
          segStart = pos;
        }
      }
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
