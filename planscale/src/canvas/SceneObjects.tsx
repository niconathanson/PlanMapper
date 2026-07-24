import { Line, Circle, Group, Label, Tag, Text } from 'react-konva';
import type Konva from 'konva';
import { PX_PER_M, areaCorners, areaCenter, rotate, sub } from '../core/geometry';
import { fmtLen, fmtArea, fmtCoord } from '../core/readout';
import {
  polygonArea,
  pathLength,
} from '../core/geometry';
import type { OriginFrame } from '../core/geometry';
import type { UnitSystem } from '../core/units';
import type { AreaObj, SceneObject, Vec2 } from '../core/types';

interface Ctx {
  units: UnitSystem;
  frame: OriginFrame;
  viewScale: number;
  selectedId: string | null;
  editable: boolean; // tool === 'select'
  labelBg: string;
  labelStroke: string;
  snap: (p: Vec2) => Vec2; // grid-snap a world point (identity if snapping off)
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
  bg = 'rgba(255,255,255,0.85)',
  stroke = 'rgba(0,0,0,0.09)',
}: {
  x: number;
  y: number;
  text: string;
  viewScale: number;
  color?: string;
  bg?: string;
  stroke?: string;
}) {
  const s = 1 / viewScale;
  return (
    <Label x={x} y={y} scaleX={s} scaleY={s} listening={false} offsetY={-8}>
      <Tag fill={bg} cornerRadius={3} stroke={stroke} />
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
            ctx.onUpdate(obj.id, {
              p: ctx.snap({ x: obj.p.x + dx, y: obj.p.y + dy }),
            } as Partial<SceneObject>),
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
          bg={ctx.labelBg}
          stroke={ctx.labelStroke}
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
          onGroupDragEnd(e, (dx, dy) => {
            // snap the first vertex to the grid, move the rest by the same delta
            const anchor = pts[0];
            const snapped = ctx.snap({ x: anchor.x + dx, y: anchor.y + dy });
            const adx = snapped.x - anchor.x;
            const ady = snapped.y - anchor.y;
            ctx.onUpdate(obj.id, {
              pts: pts.map((p) => ({ x: p.x + adx, y: p.y + ady })),
            } as Partial<SceneObject>);
          })
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
                const np = ctx.snap({ x: node.x() / PX_PER_M, y: node.y() / PX_PER_M });
                node.position({ x: np.x * PX_PER_M, y: np.y * PX_PER_M });
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
          bg={ctx.labelBg}
          stroke={ctx.labelStroke}
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
  // Resize a corner handle: convert the (grid-snapped) world point to the area's
  // local frame and update the dimensions. Near corners (0,1) set wNear; far
  // corners (2,3) set length + wFar. Rectangles keep near/far widths linked.
  const resizeCorner = (i: number, node: Konva.Node) => {
    const world = ctx.snap({ x: node.x() / PX_PER_M, y: node.y() / PX_PER_M });
    const local = rotate(sub(world, obj.origin), -obj.rotationDeg);
    const half = Math.abs(local.y);
    const patch: Partial<AreaObj> = {};
    if (i === 0 || i === 1) {
      patch.wNear = Math.max(0.05, 2 * half);
      if (obj.shape === 'rect') patch.wFar = patch.wNear;
    } else {
      patch.length = Math.max(0.05, local.x);
      patch.wFar = Math.max(0.05, 2 * half);
      if (obj.shape === 'rect') patch.wNear = patch.wFar;
    }
    ctx.onUpdate(obj.id, patch as Partial<SceneObject>);
  };

  return (
    <Group
      draggable={ctx.editable}
      onClick={() => ctx.onSelect(obj.id)}
      onTap={() => ctx.onSelect(obj.id)}
      onDragEnd={(e) =>
        onGroupDragEnd(e, (dx, dy) =>
          ctx.onUpdate(obj.id, {
            origin: ctx.snap({ x: obj.origin.x + dx, y: obj.origin.y + dy }),
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
          <Circle
            key={i}
            x={p.x * PX_PER_M}
            y={p.y * PX_PER_M}
            radius={handleR * 1.3}
            fill="#fff"
            stroke={obj.color}
            strokeWidth={sw}
            draggable={ctx.editable}
            onDragMove={(e) => resizeCorner(i, e.target)}
          />
        ))}
      <ScreenLabel
        x={c.x * PX_PER_M}
        y={c.y * PX_PER_M}
        viewScale={ctx.viewScale}
        color={obj.color}
        bg={ctx.labelBg}
        stroke={ctx.labelStroke}
        text={`${obj.label ? obj.label + '  ·  ' : ''}${label}`}
      />
    </Group>
  );
}
