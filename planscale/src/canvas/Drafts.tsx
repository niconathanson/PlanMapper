import { Line, Circle, Group, Label, Tag, Text } from 'react-konva';
import { PX_PER_M, dist, pathLength } from '../core/geometry';
import { fmtLen } from '../core/readout';
import type { UnitSystem } from '../core/units';
import type { DrawDraft, ScaleDraft } from '../core/store';
import type { Vec2 } from '../core/types';

const toStage = (p: Vec2) => [p.x * PX_PER_M, p.y * PX_PER_M];

function Tooltip({ x, y, text, viewScale }: { x: number; y: number; text: string; viewScale: number }) {
  const s = 1 / viewScale;
  return (
    <Label x={x} y={y} scaleX={s} scaleY={s} listening={false} offsetY={-10}>
      <Tag fill="rgba(20,20,20,0.9)" cornerRadius={3} pointerDirection="down" pointerWidth={6} pointerHeight={4} />
      <Text text={text} fontSize={12} padding={5} fill="#fff" fontFamily="system-ui, sans-serif" />
    </Label>
  );
}

export function DraftOverlay({
  draft,
  units,
  viewScale,
}: {
  draft: DrawDraft;
  units: UnitSystem;
  viewScale: number;
}) {
  const pts = draft.pts;
  const cursor = draft.cursor;
  const sw = 2 / viewScale;
  const r = 4 / viewScale;
  const color = '#1565c0';

  const preview = cursor ? [...pts, cursor] : pts;
  const flat = preview.flatMap(toStage);
  const isPolygon = draft.tool === 'polygon';

  // live segment length (from last committed point to cursor)
  let segLabel: React.ReactNode = null;
  if (cursor && pts.length > 0) {
    const last = pts[pts.length - 1];
    const mid = { x: (last.x + cursor.x) / 2, y: (last.y + cursor.y) / 2 };
    segLabel = (
      <Tooltip
        x={mid.x * PX_PER_M}
        y={mid.y * PX_PER_M}
        viewScale={viewScale}
        text={fmtLen(dist(last, cursor), units)}
      />
    );
  }

  // running total near cursor
  let totalLabel: React.ReactNode = null;
  if (cursor && pts.length >= 1) {
    const total = pathLength([...pts, cursor]);
    totalLabel = (
      <Tooltip
        x={cursor.x * PX_PER_M}
        y={cursor.y * PX_PER_M + 22 / viewScale}
        viewScale={viewScale}
        text={`Σ ${fmtLen(total, units)}${isPolygon && pts.length >= 2 ? '  (dbl-click / Enter to close)' : ''}`}
      />
    );
  }

  return (
    <Group listening={false}>
      {isPolygon && preview.length >= 3 && (
        <Line points={flat} closed stroke={color + '55'} strokeWidth={sw} fill={color + '11'} dash={[6 / viewScale, 6 / viewScale]} />
      )}
      <Line points={flat} stroke={color} strokeWidth={sw} />
      {pts.map((p, i) => (
        <Circle key={i} x={p.x * PX_PER_M} y={p.y * PX_PER_M} radius={r} fill="#fff" stroke={color} strokeWidth={sw} />
      ))}
      {cursor && <Circle x={cursor.x * PX_PER_M} y={cursor.y * PX_PER_M} radius={r} fill={color} />}
      {segLabel}
      {totalLabel}
    </Group>
  );
}

export function ScaleOverlay({
  scaleDraft,
  units,
  viewScale,
}: {
  scaleDraft: ScaleDraft;
  units: UnitSystem;
  viewScale: number;
}) {
  const { a, b } = scaleDraft;
  const sw = 2 / viewScale;
  const r = 5 / viewScale;
  const color = '#c62828';
  return (
    <Group listening={false}>
      {a && b && <Line points={[...toStage(a), ...toStage(b)]} stroke={color} strokeWidth={sw} />}
      {a && <Circle x={a.x * PX_PER_M} y={a.y * PX_PER_M} radius={r} fill="#fff" stroke={color} strokeWidth={sw} />}
      {b && <Circle x={b.x * PX_PER_M} y={b.y * PX_PER_M} radius={r} fill="#fff" stroke={color} strokeWidth={sw} />}
      {a && b && (
        <Tooltip
          x={((a.x + b.x) / 2) * PX_PER_M}
          y={((a.y + b.y) / 2) * PX_PER_M}
          viewScale={viewScale}
          text={`measured: ${fmtLen(dist(a, b), units)}`}
        />
      )}
    </Group>
  );
}
