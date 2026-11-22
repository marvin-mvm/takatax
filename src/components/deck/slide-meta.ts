import { createContext } from "react";

/** The position of a slide in the deck, shown in its footer. */
export interface SlideMeta {
  number: number;
  total: number;
  /** Every slide's id, in order, so a slide can name another slide's number. */
  ids: string[];
}

export const SlideMetaContext = createContext<SlideMeta>({ number: 0, total: 0, ids: [] });
