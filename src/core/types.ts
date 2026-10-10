// Shapes of the data file (src/data/tree-of-bob.json). Every list is data-driven and may grow.

export type Confidence = 'high' | 'medium' | 'low';

/** A point in reading order: book id and chapter number (chapter numbers run on through Book 4's two parts). */
export interface Reveal {
  book: number;
  chapter: number;
}

interface Provenance {
  confidence?: Confidence;
  sources?: string[];
}

export interface Chapter extends Provenance {
  n: number;
  /** Display label, e.g. "Part 2 · Ch 7" in Book 4. */
  label?: string | null;
  pov?: string | null;
  date?: string | null;
  place?: string | null;
  /** Decimal story year, e.g. 2171.542. */
  year?: number | null;
}

export interface Book {
  id: number;
  title: string;
  year?: number;
  chapters: Chapter[];
}

export interface Alternative {
  source: string;
  reveal?: Reveal | null;
  parent?: string | null;
  born?: number | null;
  where?: string | null;
  year?: number | null;
  text?: string | null;
}

export interface MadeBy extends Provenance {
  id: string;
  reveal?: Reveal | null;
  note?: string | null;
}

export interface BobRecord extends Provenance {
  id: string;
  parent: string | null;
  /** Bob who physically made the copy, when different from the mind source. Has its own reveal point. */
  madeBy?: MadeBy | null;
  born: number | null;
  when?: string | null;
  where?: string | null;
  reveal: Reveal;
  about?: string | null;
  /** Set when this record is a named group, e.g. Starfleet. */
  members?: string[] | null;
  alt?: Alternative[] | null;
}

/** How a journey leg was made: through normal space (years), an instant wormhole hop, or a matrix sent by comms. */
export type Via = 'voyage' | 'wormhole' | 'transmitted';

export interface MoveRecord extends Provenance {
  /** A Bob id, or an others[].id for another replicant's movements. */
  bob: string;
  kind: 'depart' | 'arrive';
  year: number | null;
  from?: string | null;
  to?: string | null;
  at?: string | null;
  reveal: Reveal;
  /** Absent means a voyage through normal space. */
  via?: Via;
  /** Set by computeView, never in the data file: an arrival inferred from a chapter heading (see view.ts). */
  inferred?: boolean;
}

export interface FateRecord extends Provenance {
  /** A Bob id, or an others[].id. */
  bob: string;
  year: number | null;
  status?: 'lost' | 'missing' | 'alive';
  text?: string | null;
  partial?: boolean;
  reveal: Reveal;
}

export interface ScutRecord extends Provenance {
  bob: string;
  year: number | null;
  how: 'joined' | 'born' | string;
  text?: string | null;
  yearKind?: string;
  reveal: Reveal;
  alt?: Alternative[] | null;
}

export interface MilestoneRecord extends Provenance {
  year: number | null;
  text: string;
  reveal: Reveal;
}

export interface OtherRecord extends Provenance {
  id: string;
  kind?: string | null;
  about?: string | null;
  reveal: Reveal;
}

/** A place on the Systems map. Positions are parsecs in the equatorial J2000 frame (+x RA 0, +y RA 6h, +z north
 * celestial pole), as in the HYG catalogue; Sol is 0,0,0. */
export interface SystemRecord extends Provenance {
  /** The name used everywhere else in the data (bobs.where, moves.from/to). */
  id: string;
  /** star: catalogue star; far: a real distant object; near: placed relative to another place; direction: a heading,
   * not a place; network: a wormhole network; fictional: no position given in the books. */
  kind: 'star' | 'far' | 'near' | 'direction' | 'network' | 'fictional';
  catalog?: string | null;
  pos?: { x: number; y: number; z: number } | null;
  /** kind "near": the place it is near, and how far from it. */
  near?: string | null;
  offsetLy?: number | null;
  description?: string | null;
}

/** A group that can hold systems: humans, a human faction or nation, or another species or AI. */
export interface GroupRecord extends Provenance {
  id: string;
  label: string;
  /** Short adjective form used on the map: "Human", "Deltan", "USE". */
  short?: string | null;
  /** true: a human group (nation, colony government, faction); false: non-human (another species, an AI). */
  human: boolean;
  reveal: Reveal;
}

/** A group's presence at a system: its home system (where the species or nation comes from), a colony, an outpost
 * (base, station, mining operation) or held territory. */
export interface PresenceRecord extends Provenance {
  /** systems[].id */
  system: string;
  /** groups[].id */
  group: string;
  kind: 'home' | 'colony' | 'outpost' | 'territory';
  /** Name of the colony or base, if it has one. */
  label?: string | null;
  /** Story year it began, when known. */
  year: number | null;
  reveal: Reveal;
  /** When it ended (abandoned, destroyed, taken), with its own reveal point. */
  ended?: { year: number | null; reveal: Reveal; text?: string | null } | null;
}

/** A real background star for the map (never labelled). Same frame as SystemRecord.pos. */
export interface StarRecord {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  distLy: number;
}

export interface Settings {
  root?: string;
  defaultBook?: number;
  defaultChapter?: number;
  recentYears?: number;
  povAliases?: Record<string, string>;
  [key: string]: unknown;
}

export interface TreeData {
  settings?: Settings;
  books: Book[];
  bobs: BobRecord[];
  moves: MoveRecord[];
  fates: FateRecord[];
  scut?: ScutRecord[];
  milestones?: MilestoneRecord[];
  others?: OtherRecord[];
  systems?: SystemRecord[];
  stars?: StarRecord[];
  groups?: GroupRecord[];
  presence?: PresenceRecord[];
}

export type Status = 'active' | 'lost' | 'missing';
