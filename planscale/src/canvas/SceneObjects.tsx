import { Line, Circle, Group, Label, Tag, Text } from 'react-konva';
import type Konva from 'konva';
import { PX_PER_M, areaCorners, areaCenter } from '../core/geometry';
import { fmtLen, fmtArea, fmtCoord } from '../core/readout';
import {
  polygonArea,
  pathLength,
} from '../core/geometry';
import type { OriginFrame } from '../core/geometry';
import type { UnitSystem } from '../core/units';
import type { SceneObject, Vec2 } from '../core/types';

interface Ctx {
  units: UnitSystem;
  frame: OriginFrame;
  viewScale: number;
  selectedId: string | null;
  editable: boolean; // tool === 'select'
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SceneObject>) => void;
}

const toStage = (p: Vec2) => [p.x * PX_PER_M, p.y * PX_PER_M];

// A small text label with a translucent background that stays a constant
// on-screen size regardless of zoom.
function ScreenLabel({
  x,
  y,
  text,
  viewScale,
  color = '#111',
}: {
  x: number;
  y: number;
  text: string;
  viewScale: number;
  color?: string;
}) {
  const s = 1 / viewScale;
  return (
    <Label x={x} y={y} scaleX={s} scaleY={s} listening={false} offsetY={-8}>
      <Tag fill="rgba(255,255,255,0.85)" cornerRadius={3} stroke="#00000018" />
      <Text text={text} fontSize={12} padding={4} fill={color} fontFamily="system-ui, sans-serif" />
    </Label>
  );
}

export function SceneObjects({ objects, ctx }: { objects: SceneObject[]; ctx: Ctx }) {
  return (
    <Group>
      {objects.map((o) => (
        <ObjectNode key={o.id} obj={o} ctx={ctx} />
      ))}
    </Group>
  );
}

function ObjectNode({ obj, ctx }: { obj: SceneObject; ctx: Ctx }) {
  const selected = ctx.selectedId === obj.id;
  const sw = 2 / ctx.viewScale;
  const handleR = 5 / ctx.viewScale;

  // Whole-object move: drag a group, bake offset into geometry on drag end.
  const onGroupDragEnd = (
    e: Konva.KonvaEventObject<DragEvent>,
    apply: (dx: number, dy: number) => void,
  ) => {
    const g = e.target;
    const dx = g.x() / PX_PER_M;
    const dy = g.y() / PX_PER_M;
    g.position({ x: 0, y: 0 });
    apply(dx, dy);
  };

  if (obj.type === 'probe') {
    const [sx, sy] = toStage(obj.p);
    return (
      <Group
        draggable={ctx.editable}
        onClick={() => ctx.onSelect(obj.id)}
        onTap={() => ctx.onSelect(obj.id)}
        onDragEnd={(e) =>
          onGroupDragEnd(e, (dx, dy) =>
            ctx.onUpdate(obj.id, { p: { x: obj.p.x + dx, y: obj.p.y + dy } } as Partial<SceneObject>),
          )
        }
      >
        <Circle x={sx} y={sy} radius={handleR * 1.2} fill={obj.color} stroke="#fff" strokeWidth={sw / 2} />
        {selected && <Circle x={sx} y={sy} radius={handleR * 2} stroke={obj.color} strokeWidth={sw} />}
        <ScreenLabel
          x={sx}
          y={sy}
          viewScale={ctx.viewScale}
          color={obj.color}
          text={`${obj.label ? obj.label + '  ' : ''}${fmtCoord(obj.p, ctx.frame, ctx.units)}`}
        />
      </Group>
    );
  }

  if (obj.type === 'polygon' || obj.type === 'path') {
    const pts = obj.pts;
    const flat = pts.flatMap(toStage);
    const closed = obj.type === 'polygon';
    const metric =
      obj.type === 'polygon'
        ? `area ${fmtArea(polygonArea(pts), ctx.units)}  ·  ${pts.length} pts`
        : `run ${fmtLen(pathLength(pts), ctx.units)}  ·  ${pts.length} pts`;
    // label anchor = centroid
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;

    return (
      <Group
        draggable={ctx.editable}
        onClick={() => ctx.onSelect(obj.id)}
        onTap={() => ctx.onSelect(obj.id)}
        onDragEnd={(e) =>
          onGroupDragEnd(e, (dx, dy) =>
            ctx.onUpdate(obj.id, {
              pts: pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            } as Partial<SceneObject>),
          )
        }
      >
        <Line
          points={flat}
          closed={closed}
          stroke={obj.color}
          strokeWidth={sw}
          fill={closed ? obj.color + '22' : undefined}
          hitStrokeWidth={Math.max(10 / ctx.viewScale, sw * 4)}
        />
        {selected &&
          pts.map((p, i) => (
            <Circle
              key={i}
              x={p.x * PX_PER_M}
              y={p.y * PX_PER_M}
              radius={handleR}
              fill="#fff"
              stroke={obj.color}
              strokeWidth={sw}
              draggable
              onDragMove={(e) => {
                const node = e.target;
                const np = { x: node.x() / PX_PER_M, y: node.y() / PX_PER_M };
                const next = pts.slice();
                next[i] = np;
                ctx.onUpdate(obj.id, { pts: next } as Partial<SceneObject>);
              }}
            />
          ))}
        <ScreenLabel
          x={cx * PX_PER_M}
          y={cy * PX_PER_M}
          viewScale={ctx.viewScale}
          color={obj.color}
          text={`${obj.label ? obj.label + '  ·  ' : ''}${metric}`}
        />
      </Group>
    );
  }

  // area
  const corners = areaCorners(obj);
  const flat = corners.flatMap(toStage);
  const c = areaCenter(obj);
  const label =
    obj.shape === 'rect'
      ? `${fmtLen(obj.length, ctx.units)} × ${fmtLen(obj.wNear, ctx.units)}`
      : `L ${fmtLen(obj.length, ctx.units)} · W ${fmtLen(obj.wNear, ctx.units)}→${fmtLen(obj.wFar, ctx.units)}`;
  return (
    <Group
      draggable={ctx.editable}
      onClick={() => ctx.onSelect(obj.id)}
      onTap={() => ctx.onSelect(obj.id)}
      onDragEnd={(e) =>
        onGroupDragEnd(e, (dx, dy) =>
          ctx.onUpdate(obj.id, {
            origin: { x: obj.origin.x + dx, y: obj.origin.y + dy },
          } as Partial<SceneObject>),
        )
      }
    >
      <Line
        points={flat}
        closed
        stroke={obj.color}
        strokeWidth={sw}
        fill={obj.color + '2e'}
        hitStrokeWidth={4}
      />
      {selected &&
        corners.map((p, i) => (
          <Circle key={i} x={p.x * PX_PER_M} y={p.y * PX_PER_M} radius={handleR} fill={obj.color} stroke="#fff" strokeWidth={sw / 2} />
        ))}
      <ScreenLabel
        x={c.x * PX_PER_M}
        y={c.y * PX_PER_M}
        viewScale={ctx.viewScale}
        color={obj.color}
        text={`${obj.label ? obj.label + '  ·  ' : ''}${label}`}
      />
    </Group>
  );
}
