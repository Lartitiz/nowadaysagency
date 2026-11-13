import { expect, it } from "vitest";
import { briefsWithoutTwin, twinBriefIds } from "@/lib/brief-twins";

it("hides a brief whose subject already has a started content card", () => {
  const briefs = [{ id: "a", subject: "Pourquoi je travaille toujours avec les mêmes artisans" }, { id: "b", subject: "Autre sujet" }];
  expect(briefsWithoutTwin(briefs, ["Pourquoi je travaille toujours avec les  mêmes artisans."]).map((b) => b.id)).toEqual(["b"]);
  expect(briefsWithoutTwin(briefs, [])).toHaveLength(2);
  expect(briefsWithoutTwin([{ id: "c", subject: null }], [null, ""])).toHaveLength(1);
});

it("finds the hidden twin briefs of a deleted card", () => {
  const briefs = [{ id: "a", subject: "Mon sujet" }, { id: "b", subject: "Autre" }];
  expect(twinBriefIds(briefs, "mon sujet.")).toEqual(["a"]);
  expect(twinBriefIds(briefs, "")).toEqual([]);
});
