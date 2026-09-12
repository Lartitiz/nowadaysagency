import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useCreationEntryKey } from "@/hooks/use-creation-entry-key";
it("remounts a restored draft on fresh start, but not when the URL is cleaned", () => {
  const {result,rerender}=renderHook(({search,key})=>useCreationEntryKey(search,key),{initialProps:{search:"",key:"restored"}});
  const restored=result.current;
  rerender({search:"?new=1&canal=instagram",key:"fresh"});
  expect(result.current).not.toBe(restored);
  const fresh=result.current;
  rerender({search:"?canal=instagram",key:"cleaned"});
  expect(result.current).toBe(fresh);
  rerender({search:"?new=1",key:"next-fresh"});
  expect(result.current).not.toBe(fresh);
});
it("does not remount ordinary updates or rerenders", () => {
  const {result,rerender}=renderHook(({search,key})=>useCreationEntryKey(search,key),{initialProps:{search:"?new=1",key:"fresh"}});
  rerender({search:"?new=1",key:"fresh"}); expect(result.current).toBe("fresh");
  rerender({search:"",key:"clean"}); expect(result.current).toBe("fresh");
  rerender({search:"?from=instagram",key:"updated"}); expect(result.current).toBe("fresh");
});
