import { Line, Circle, Group } from 'react-konva';
import { PX_PER_M, rotate } from '../core/geometry';
import type { ViewState } from '../core/store';
import type { Vec2 } from '../core/types';

// Choose a "nice" grid spacing (in meters) so gridlines land ~targetPx apart.
function niceSpacingMeters(view: ViewState, targetPx = 80): number {
  const pxPerMeter = PX_PER_M * view.scale;
  const raw = targetPx / pxPerMeter;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * pow;
}

interface VisBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} // stage units

// Logical bounds of the visible viewport, accounting for view rotation (the
// visible region is a rotated rectangle, so we bound its four screen corners).
function visibleStageBounds(view: ViewState, w: number, h: number): VisBounds {
  const toLogical = (px: number, py: number): Vec2 => {
    const t = rotate({ x: px - view.x, y: py - view.y }, -view.rot);
    return { x: t.x / view.scale, y: t.y / view.scale };
  };
  const corners = [toLogical(0, 0), toLogical(w, 0), toLogical(w, h), toLogical(0, h)];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function Grid({
  view,
  width,
  height,
  stroke = '#dfe3ea',
}: {
  view: ViewState;
  width: number;
  height: number;
  stroke?: string;
}) {
  const spacing = niceSpacingMeters(view);
  const b = visibleStageBounds(view, width, height);
  const stagePerM = PX_PER_M;
  const sw = 1 / view.scale;
  const lines: React.ReactNode[] = [];

  const startX = Math.floor(b.minX / (spacing * stagePerM)) * spacing;
  const endX = b.maxX / stagePerM;
  for (let mx = startX; mx <= endX; mx += spacing) {
    const x = mx * stagePerM;
    lines.push(
      <Line key={`v${mx}`} points={[x, b.minY, x, b.maxY]} stroke={stroke} strokeWidth={sw} />,
    );
  }
  const startY = Math.floor(b.minY / (spacing * stagePerM)) * spacing;
  const endY = b.maxY / stagePerM;
  for (let my = startY; my <= endY; my += spacing) {
    const y = my * stagePerM;
    lines.push(
      <Line key={`h${my}`} points={[b.minX, y, b.maxX, y]} stroke={stroke} strokeWidth={sw} />,
    );
  }
  return <Group listening={false}>{lines}</Group>;
}

// Origin axes: X axis (red) and Y axis (blue) through the user-set origin,
// rotated by the origin axis angle. Y is drawn toward screen-up (negative
// stage-Y) so the positive Y direction matches the "up = positive" readout.
export function OriginAxes({
  origin,
  rotationDeg,
  view,
  width,
  height,
  dotColor = '#111',
}: {
  origin: Vec2;
  rotationDeg: number;
  view: ViewState;
  width: number;
  height: number;
  dotColor?: string;
}) {
  const o = { x: origin.x * PX_PER_M, y: origin.y * PX_PER_M };
  const b = visibleStageBounds(view, width, height);
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) + 1000;
  const sw = 1.5 / view.scale;

  // +X direction (stage): rotate (1,0) by rotationDeg
  const xdir = rotate({ x: 1, y: 0 }, rotationDeg);
  // +Y (up = positive readout) is stage -Y, i.e. rotate (0,-1)
  const ydir = rotate({ x: 0, y: -1 }, rotationDeg);

  const axis = (dir: Vec2, color: string, key: string) => (
    <Line
      key={key}
      points={[
        o.x - dir.x * diag,
        o.y - dir.y * diag,
        o.x + dir.x * diag,
        o.y + dir.y * diag,
      ]}
      stroke={color}
      strokeWidth={sw}
      listening={false}
    />
  );

  return (
    <Group listening={false}>
      {axis(xdir, '#d64545', 'x')}
      {axis(ydir, '#3a6ea5', 'y')}
      <Circle x={o.x} y={o.y} radius={5 / view.scale} fill={dotColor} />
    </Group>
  );
}
