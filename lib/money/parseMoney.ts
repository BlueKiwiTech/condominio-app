// Parses an amount typed (or pasted) in the app's own es-VE convention: "." groups
// thousands and "," is the decimal point ("1.234,56"). The reading is strict on
// purpose -- an ambiguous or odd entry is reported as an error instead of being
// silently "fixed", because a silently altered amount is money counted wrong
// (QA round 1: "1.000,50" was read as 1,00 and "-5" as +5).
//
// Accepted:
//   1234        1234,5      1234,56     1.234,56    1.234.567     1234.5   1234.56
//   ("." followed by 1-2 digits is read as a decimal point; "." followed by exactly
//    3 digits and nothing else is read as thousands, as the app prints amounts)
// Rejected (error): letters, signs ("-", "+"), exponents ("1e9"), more than one ",",
//   a "," before a ".", groups that are not 3 digits, 3+ decimals after a ".".
// Empty text is not an error: it means "no amount yet" (value null).
export type MoneyParse = { value: number | null; error: boolean };

const ERROR: MoneyParse = { value: null, error: true };

export function parseMoneyInput(raw: string): MoneyParse {
  const s = raw.trim();
  if (s === '') return { value: null, error: false };
  if (s.length > 24 || /[^0-9.,]/.test(s)) return ERROR;

  const commas = s.split(',').length - 1;
  if (commas > 1) return ERROR;

  if (commas === 1) {
    const [intPart, decPart] = s.split(',');
    const intOk = intPart === '' || /^\d+$/.test(intPart) || /^\d{1,3}(\.\d{3})+$/.test(intPart);
    if (!intOk || !/^\d*$/.test(decPart) || (intPart === '' && decPart === '')) return ERROR;
    return finish(`${intPart.replace(/\./g, '') || '0'}.${decPart || '0'}`);
  }

  const dots = s.split('.').length - 1;
  if (dots === 0) return finish(s);
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return finish(s.replace(/\./g, '')); // "1.234" / "1.234.567" = thousands
  if (dots === 1 && /^\d*\.\d{1,2}$/.test(s)) return finish(s.startsWith('.') ? `0${s}` : s); // "1234.5" / "10.25"
  return ERROR;
}

function finish(normalized: string): MoneyParse {
  const value = Number(normalized);
  return Number.isFinite(value) ? { value, error: false } : ERROR;
}
