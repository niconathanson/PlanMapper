import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useImage } from './useImage';
import { PX_PER_M } from '../core/geometry';
import type { PlanImage } from '../core/types';

interface Props {
  image: PlanImage;
  draggable: boolean;
  onDragEnd: (centerWorld: { x: number; y: number }) => void;
}

// Renders the plan image in stage space. The image's world center maps to the
// node origin (via offset), so rotation happens about the center.
export function PlanImageNode({ image, draggable, onDragEnd }: Props) {
  const el = useImage(image.src);
  if (!el || !image.visible) return null;

  const s = image.mPerPx * PX_PER_M; // stage units per image pixel

  return (
    <KonvaImage
      image={el}
      x={image.center.x * PX_PER_M}
      y={image.center.y * PX_PER_M}
      offsetX={image.natW / 2}
      offsetY={image.natH / 2}
      scaleX={s}
      scaleY={s}
      rotation={image.rotationDeg}
      opacity={image.opacity}
      draggable={draggable}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        onDragEnd({ x: node.x() / PX_PER_M, y: node.y() / PX_PER_M });
      }}
      listening={draggable}
    />
  );
}
