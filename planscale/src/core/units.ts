// Unit systems and length/coordinate formatting + parsing.
// Canonical internal length unit is METERS. All stored geometry is in meters.

// 'ft-in'  → feet + inches, e.g. 33' 6"          (label "ft & in")
// 'ft.in'  → Soundvision-style feet.inch, e.g. 11.06 = 11' 6"
// 'ft-dec' → decimal feet, e.g. 33.500 ft
// 'm'      → meters
export type UnitSystem = 'ft-in' | 'ft.in' | 'ft-dec' | 'm';

export const M_PER_FT = 0.3048;
export const FT_PER_M = 1 / M_PER_FT;

export const UNIT_LABELS: Record<UnitSystem, string> = {
  'ft-in': 'Feet & inches',
  'ft.in': 'Soundvision (ft.in)',
  'ft-dec': 'Feet (decimal)',
  m: 'Meters',
};

export const UNIT_SHORT: Record<UnitSystem, string> = {
  'ft-in': 'ft & in',
  'ft.in': 'ft.in',
  'ft-dec': 'ft',
  m: 'm',
};

// Round a value to the nearest step (e.g. nearest 1/8 inch => step 0.125).
function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

// Reduce a fraction n/d to lowest terms.
function reduceFraction(n: number, d: number): [number, number] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

// Format inches as e.g. `6"`, `6 1/2"`, `0"`, snapping to nearest 1/denom inch.
function formatInches(inches: number, denom = 8): string {
  const rounded = roundToStep(inches, 1 / denom);
  const whole = Math.floor(rounded + 1e-9);
  const fracInches = rounded - whole;
  const num = Math.round(fracInches * denom);
  if (num === 0) return `${whole}"`;
  if (num === denom) return `${whole + 1}"`;
  const [n, d] = reduceFraction(num, denom);
  return whole === 0 ? `${n}/${d}"` : `${whole} ${n}/${d}"`;
}

// Soundvision-style feet.inch: 11' 6" -> "11.06". Inches are rounded to whole
// inches and zero-padded to two digits (the L-Acoustics convention).
function formatFtDotIn(meters: number): string {
  const feet = meters * FT_PER_M;
  const neg = feet < 0;
  let ft = Math.floor(Math.abs(feet));
  let inch = Math.round((Math.abs(feet) - ft) * 12);
  if (inch >= 12) {
    ft += 1;
    inch = 0;
  }
  return `${neg ? '-' : ''}${ft}.${inch < 10 ? '0' : ''}${inch}`;
}

// Format a length (meters) as a display string in the given unit system.
export function formatLength(meters: number, units: UnitSystem, decimals = 3): string {
  if (units === 'm') return `${meters.toFixed(decimals)} m`;
  if (units === 'ft.in') return formatFtDotIn(meters);
  const feet = meters * FT_PER_M;
  if (units === 'ft-dec') return `${feet.toFixed(decimals)} ft`;
  // ft-in
  const neg = feet < 0;
  let ft = Math.floor(Math.abs(feet));
  let inches = (Math.abs(feet) - ft) * 12;
  // handle rounding that pushes inches to 12
  const roundedInches = roundToStep(inches, 1 / 8);
  if (roundedInches >= 12) {
    ft += 1;
    inches = 0;
  } else {
    inches = roundedInches;
  }
  const sign = neg ? '-' : '';
  return `${sign}${ft}' ${formatInches(inches)}`;
}

// A compact numeric-only representation used inside editable table cells.
// (No unit suffix; the column header carries the unit.)
export function formatLengthValue(meters: number, units: UnitSystem, decimals = 3): string {
  if (units === 'm') return (meters).toFixed(decimals);
  const feet = meters * FT_PER_M;
  if (units === 'ft-dec') return feet.toFixed(decimals);
  // ft-in => `33' 6 1/2"`
  return formatLength(meters, units).replace(/^/, '');
}

// Format an area (square meters) in the active unit system. Feet-based systems
// both report square feet (fractional inches don't apply to areas).
export function formatArea(sqMeters: number, units: UnitSystem, decimals = 1): string {
  if (units === 'm') return `${sqMeters.toFixed(decimals)} m²`;
  const sqft = sqMeters * FT_PER_M * FT_PER_M;
  return `${sqft.toFixed(decimals)} ft²`;
}

// Format a coordinate pair. worldY is negated on the way in by the caller so
// that "up" is positive; this only formats the numbers.
export function formatCoord(x: number, y: number, units: UnitSystem): string {
  return `(${formatLength(x, units)}, ${formatLength(y, units)})`;
}

// ---- Parsing (for editable numeric inputs) ----

// Parse a user-entered length string into METERS, interpreting it according to
// the active unit system but also honoring explicit unit markers.
// Accepts things like:  33.5   33'6"   33' 6 1/2"   10m   120"   4ft
export function parseLength(input: string, units: UnitSystem): number | null {
  const s = input.trim().toLowerCase();
  if (s === '') return null;

  // explicit meters
  if (/m$/.test(s) && !/'|"/.test(s)) {
    const v = parseFloat(s.replace(/m$/, '').trim());
    return isNaN(v) ? null : v;
  }

  // feet-and-inches forms, e.g. 33'6", 33' 6 1/2", 33', 6"
  if (s.includes("'") || s.includes('"')) {
    return parseFeetInches(s);
  }

  // Soundvision ft.in: the two digits after the point are inches (11.06 = 11'6")
  if (units === 'ft.in') {
    const v = parseFloat(s);
    if (isNaN(v)) return null;
    const abs = Math.abs(v);
    const ft = Math.floor(abs);
    const inch = Math.round((abs - ft) * 100);
    return Math.sign(v || 1) * (ft + inch / 12) * M_PER_FT;
  }

  // bare number: interpret per active unit system
  const v = parseFloat(s.replace(/[a-z]/g, '').trim());
  if (isNaN(v)) return null;
  if (units === 'm') return v;
  return v * M_PER_FT; // ft-dec and ft-in bare numbers are feet
}

function parseFeetInches(s: string): number | null {
  let feet = 0;
  let inches = 0;
  const feetMatch = s.match(/(-?\d+(?:\.\d+)?)\s*'/);
  if (feetMatch) feet = parseFloat(feetMatch[1]);
  // inches part: everything after the ' (or whole string if no ')
  const afterFeet = feetMatch ? s.slice(s.indexOf("'") + 1) : s;
  const inchStr = afterFeet.replace(/"/g, '').trim();
  if (inchStr) {
    // could be "6", "6 1/2", "1/2"
    const parts = inchStr.split(/\s+/);
    for (const part of parts) {
      if (part.includes('/')) {
        const [n, d] = part.split('/').map(Number);
        if (d) inches += n / d;
      } else {
        const v = parseFloat(part);
        if (!isNaN(v)) inches += v;
      }
    }
  }
  const sign = feet < 0 || s.trim().startsWith('-') ? -1 : 1;
  const totalFeet = Math.abs(feet) + inches / 12;
  return sign * totalFeet * M_PER_FT;
}
