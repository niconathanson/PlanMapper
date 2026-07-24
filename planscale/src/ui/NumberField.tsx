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

// A plain numeric input (for angles, opacity, etc.) with commit-on-blur.
export function NumField({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(Math.round(value * 100) / 100));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text);
    if (!isNaN(v)) {
      let clamped = v;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onCommit(clamped);
    } else setText(String(value));
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
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </>
  );
}
