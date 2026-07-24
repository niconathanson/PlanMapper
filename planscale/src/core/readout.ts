// Helpers that turn stored world geometry (meters, Y-down) into user-facing
// strings, honoring the active unit system and origin frame.

import { toDisplay, type OriginFrame } from './geometry';
import { formatLength, formatArea, type UnitSystem } from './units';
import type { Vec2 } from './types';

export function fmtLen(meters: number, units: UnitSystem): string {
  return formatLength(meters, units);
}

export function fmtArea(sqMeters: number, units: UnitSystem): string {
  return formatArea(sqMeters, units);
}

// Formatted coordinate string relative to origin, "up = positive".
export function fmtCoord(world: Vec2, frame: OriginFrame, units: UnitSystem): string {
  const d = toDisplay(world, frame);
  return `${formatLength(d.x, units)},  ${formatLength(d.y, units)}`;
}

// Display coordinate values (numbers, meters, Y-up) for table cells.
export function displayXY(world: Vec2, frame: OriginFrame): Vec2 {
  return toDisplay(world, frame);
}
