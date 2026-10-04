import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CALENDAR_CAPTION_CASES } from "./calendar-caption-cases.ts";
import { calendarPublishCaption } from "./calendar-caption.ts";

// Les mêmes cas tournent côté front (src/test/calendar-caption.test.ts) :
// une seule règle, vérifiée des deux côtés.
for (const c of CALENDAR_CAPTION_CASES) {
  Deno.test(`légende publiée : ${c.name}`, () => {
    assertEquals(calendarPublishCaption(c.draft, c.detail), c.expected);
  });
}
