import { DEMO_DATA } from "./demo-data";
import { DEMO_DATA_MDB } from "./demo-data-mdb";

export type DemoProfileId = "lea" | "auriana_mdb";

export interface DemoProfileMeta {
  id: DemoProfileId;
  label: string;
  sector: string;
  data: typeof DEMO_DATA;
}

export const DEMO_PROFILES: Record<DemoProfileId, DemoProfileMeta> = {
  lea: {
    id: "lea",
    label: "Léa, photographe",
    sector: "Portrait & personal branding",
    data: DEMO_DATA as any,
  },
  auriana_mdb: {
    id: "auriana_mdb",
    label: "Auriana, marchande de biens",
    sector: "Immobilier — Cercle MDB",
    data: DEMO_DATA_MDB as any,
  },
};

export const DEFAULT_DEMO_PROFILE: DemoProfileId = "lea";
