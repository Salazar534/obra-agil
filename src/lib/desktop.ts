import { useEffect, useState } from "react";

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useDesktop() {
  return useMedia("(min-width: 1024px)");
}

export function useWideScreen() {
  return useMedia("(min-width: 768px)");
}
