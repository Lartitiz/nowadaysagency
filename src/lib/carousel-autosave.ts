/** Serial, optimistic writes. Never silently replace another session's version. */
export type CarouselSnapshot = Record<string, any>;
export interface CarouselVersion {
  savedAt: string;
  raw: CarouselSnapshot;
}
export interface CloudMeta {
  revision: string;
  history: CarouselVersion[];
}
export interface DraftRow {
  id: string;
  updated_at: string | null;
  content_data: any;
}
export interface DraftStore {
  read(id: string): Promise<DraftRow | null>;
  insert(id: string, raw: CarouselSnapshot): Promise<DraftRow>;
  update(
    id: string,
    timestamp: string | null,
    raw: CarouselSnapshot,
  ): Promise<DraftRow | null>;
}
export function cleanCarouselSnapshot(raw: CarouselSnapshot): CarouselSnapshot {
  const {
    _carousel_cloud: _cloud,
    _carousel_base_updated_at: _base,
    ...content
  } = raw;
  return content;
}
export class CarouselConflict extends Error {
  constructor() {
    super(
      "Une version plus récente existe. Reprends-la depuis Mes idées ou enregistre tes retouches dans une copie.",
    );
  }
}

export class CarouselAutosaver {
  private row: DraftRow | null | undefined;
  private acknowledged = "";
  private pending?: CarouselSnapshot;
  private running?: Promise<void>;
  private forceCheckpoint = false;
  private active = true;
  private attached = true;
  private uncertainRevision?: string;
  meta?: CloudMeta;
  constructor(
    readonly id: string,
    private existing: boolean,
    private baseline: CarouselSnapshot,
    private store: DraftStore,
    private onSaved: (meta: CloudMeta) => void,
  ) {}
  dispose() {
    this.active = false;
    this.pending = undefined;
  }
  detach() {
    this.attached = false;
  }
  queue(raw: CarouselSnapshot) {
    if (this.active) this.pending = cleanCarouselSnapshot(raw);
  }
  checkpoint() {
    this.forceCheckpoint = true;
  }
  get dirty() {
    return !!this.pending && JSON.stringify(this.pending) !== this.acknowledged;
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async drain() {
    while (this.active && this.pending) {
      if (this.uncertainRevision) {
        const found = await this.store.read(this.id);
        if (
          found?.content_data?._carousel_cloud?.revision ===
          this.uncertainRevision
        ) {
          this.row = found;
          this.meta = found.content_data._carousel_cloud;
          this.acknowledged = JSON.stringify(
            cleanCarouselSnapshot(found.content_data),
          );
          this.forceCheckpoint = false;
          if (this.attached && this.active) this.onSaved(this.meta!);
        } else if (found?.updated_at !== this.row?.updated_at) {
          throw new CarouselConflict();
        }
        this.uncertainRevision = undefined;
      }
      const snapshot = this.pending;
      const key = JSON.stringify(snapshot);
      if (key === this.acknowledged) {
        this.pending = undefined;
        break;
      }
      if (this.row === undefined) {
        this.row = await this.store.read(this.id);
        if (!this.active) return;
        if (this.existing && !this.row)
          throw new Error(
            "Ce brouillon n’est plus accessible dans cet espace.",
          );
        if (this.row) {
          const serverRevision =
            this.row.content_data?._carousel_cloud?.revision;
          const localRevision = this.baseline._carousel_cloud?.revision;
          if (
            serverRevision !== localRevision ||
            (!localRevision &&
              this.baseline._carousel_base_updated_at !== undefined &&
              this.baseline._carousel_base_updated_at !== this.row.updated_at)
          ) {
            this.row = undefined;
            throw new CarouselConflict();
          }
          this.meta = this.row.content_data?._carousel_cloud;
        }
      }
      const prior = this.row?.content_data;
      let history: CarouselVersion[] = this.meta?.history || [];
      const now = new Date().toISOString();
      if (
        prior?.carousel_editor_version &&
        (this.forceCheckpoint ||
          !history.length ||
          Date.now() - Date.parse(history[0].savedAt) >= 5 * 60_000)
      ) {
        history = [
          {
            savedAt: this.row?.updated_at || now,
            raw: cleanCarouselSnapshot(prior),
          },
          ...history,
        ].slice(0, 3);
      }
      // Bound history overhead (embedded photos can be large). Latest document is never truncated.
      while (history.length && JSON.stringify(history).length > 8_000_000)
        history = history.slice(0, -1);
      const meta: CloudMeta = { revision: crypto.randomUUID(), history };
      const payload = { ...snapshot, _carousel_cloud: meta };
      let saved: DraftRow | null;
      try {
        this.uncertainRevision = meta.revision;
        if (this.row)
          saved = await this.store.update(
            this.id,
            this.row.updated_at,
            payload,
          );
        else {
          saved = await this.store.insert(this.id, payload);
        }
        if (!saved) throw new CarouselConflict();
      } catch (error) {
        // A response can be lost after the commit. Recognise that exact write;
        // do not insert a duplicate or mistake another session's write for ours.
        const found = await this.store.read(this.id).catch(() => null);
        if (found?.content_data?._carousel_cloud?.revision === meta.revision)
          saved = found;
        else {
          if (found && found.updated_at !== this.row?.updated_at)
            throw new CarouselConflict();
          throw error;
        }
      }
      this.row = saved;
      this.uncertainRevision = undefined;
      this.meta = meta;
      this.acknowledged = key;
      this.forceCheckpoint = false;
      if (this.active && this.attached) this.onSaved(meta);
    }
  }
}
