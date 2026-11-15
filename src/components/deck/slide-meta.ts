import { createContext } from "react";

/** The position of a slide in the deck, shown in its footer. */
export interface SlideMeta {
  number: number;
  total: number;
}

export const SlideMetaContext = createContext<SlideMeta>({ number: 0, total: 0 });
