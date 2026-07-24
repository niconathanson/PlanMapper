import { useEffect, useState } from 'react';

// Load an HTMLImageElement from a src (data URL) for use in a Konva <Image>.
export function useImage(src: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>(undefined);
  useEffect(() => {
    if (!src) {
      setImg(undefined);
      return;
    }
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return img;
}
