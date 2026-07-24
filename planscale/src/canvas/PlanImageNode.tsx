import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useImage } from './useImage';
import { PX_PER_M, add, sub, rotate } from '../core/geometry';
import type { PlanImage, Vec2 } from '../core/types';

interface Props {
  image: PlanImage;
  origin: Vec2; // rotation pivot (world meters)
  draggable: boolean;
  onDragEnd: (centerWorld: Vec2) => void;
}

// Renders the plan image rotated about the ORIGIN. The stored `center` is the
// image centre in the unrotated frame; the rendered centre orbits the origin as
// rotation changes: rendered = origin + R(θ)·(center − origin). Two-point
// scaling also pivots on the origin (see store.applyScale), so the origin point
// stays fixed on the plan under both scale and rotation.
export function PlanImageNode({ image, origin, draggable, onDragEnd }: Props) {
  const el = useImage(image.src);
  if (!el || !image.visible) return null;

  const s = image.mPerPx * PX_PER_M; // stage units per image pixel
  const rendered = add(origin, rotate(sub(image.center, origin), image.rotationDeg));

  return (
    <KonvaImage
      image={el}
      x={rendered.x * PX_PER_M}
      y={rendered.y * PX_PER_M}
      offsetX={image.natW / 2}
      offsetY={image.natH / 2}
      scaleX={s}
      scaleY={s}
      rotation={image.rotationDeg}
      opacity={image.opacity}
      draggable={draggable}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        const renderedWorld = { x: node.x() / PX_PER_M, y: node.y() / PX_PER_M };
        // invert the origin-pivot rotation to recover the stored centre
        const center = add(origin, rotate(sub(renderedWorld, origin), -image.rotationDeg));
        onDragEnd(center);
      }}
      listening={draggable}
    />
  );
}
