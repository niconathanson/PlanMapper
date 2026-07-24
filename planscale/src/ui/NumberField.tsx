import { useEffect, useState } from 'react';
import { formatLengthValue, parseLength, type UnitSystem } from '../core/units';

// An input for a length value stored in METERS, displayed/edited in the active
// unit system. Commits on blur or Enter; reverts on invalid input.
export function LengthField({
  meters,
  units,
  onCommit,
  disabled,
}: {
  meters: number;
  units: UnitSystem;
  onCommit: (meters: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(formatLengthValue(meters, units));
  }, [meters, units, editing]);

  const commit = () => {
    const v = parseLength(text, units);
    setEditing(false);
    if (v !== null) onCommit(v);
    else setText(formatLengthValue(meters, units));
  };

  return (
    <input
      type="text"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        setEditing(true);
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(formatLengthValue(meters, units));
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// A plain numeric input (for angles, opacity, etc.).
// With `live`, every valid keystroke / spinner step / arrow-key press commits
// immediately so the canvas updates in real time; otherwise commits on blur.
export function NumField({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  live,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  live?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(Math.round(value * 100) / 100));
  }, [value, editing]);
  const clamp = (v: number) => {
    let c = v;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    return c;
  };
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text);
    if (!isNaN(v)) onCommit(clamp(v));
    else setText(String(value));
  };
  return (
    <>
      <input
        type="number"
        value={text}
        step={step}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (live) {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onCommit(clamp(v));
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </>
  );
}
