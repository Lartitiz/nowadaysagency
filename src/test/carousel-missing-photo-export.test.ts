import { expect, it } from "vitest";
import { exportCarouselPptx } from "@/lib/export-carousel-pptx";
it("refuses a misleading export when a final passage has no suitable image", async () => {
  await expect(exportCarouselPptx([{slide_number:1,role:"body",title:"",body:"",slide_type:"photo_full",photo_index:null,photo_directive:"Les véritables bols",overlay_text:"Les cerises peintes sur les bols"}],"test",undefined,undefined,[{base64:"wrong-photo"}])).rejects.toThrow("images manquantes");
});
