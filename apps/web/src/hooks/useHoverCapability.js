import { useEffect, useState } from 'react';

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

export default function useHoverCapability() {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(HOVER_QUERY);
    const update = () => setCanHover(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return canHover;
}
