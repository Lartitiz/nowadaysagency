import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

test('mixed paragraph exports every word once as editable text, with no dark text baked into the raster', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const base64 = await page.evaluate(async () => {
    const { exportCarouselHybridPptx } = await import('/src/lib/export-carousel-hybrid-pptx.ts');
    const blob = await exportCarouselHybridPptx([{ slide_number: 1, html: `<div style="width:1080px;height:1350px;background:white;padding:80px"><p style="font:40px Arial;line-height:1.5;color:#111;margin:0">Un atelier <span data-pptx-editable="body" style="font-weight:700;color:#993333">français</span> pour votre lin.<br>Du tissu à la pièce finie.</p></div>` }], null, { font_title: 'Arial', font_body: 'Arial' }, 'test-mixed', undefined, null, { returnBlob: true }) as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  });
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const text = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(m => m[1]).join('');
  expect(text).toContain('Un atelier ');
  expect(text).toContain('pour votre lin.');
  expect(text).toContain('Du tissu à la pièce finie.');
  expect(text.match(/français/g)).toHaveLength(1);
  const media = Object.values(zip.files).filter(f => /^ppt\/media\/.*\.png$/.test(f.name));
  expect(media.length).toBeGreaterThan(0);
  for (const file of media) {
    const darkPixels = await page.evaluate(async data => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 180) dark++;
      return dark;
    }, await file.async('base64'));
    expect(darkPixels, file.name).toBe(0);
  }
});

test('mixed text promotion preserves independent layout and loads charter fonts', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { promoteMixedText, charterFontUrl } = await import('/src/lib/pptx-mixed-text.ts');
    const iframe = document.createElement('iframe'); document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.body.innerHTML = '<div id="layout">Atelier<div data-pptx-editable="title" style="font-size:70px">Titre</div><img src="data:," /></div>';
    promoteMixedText(doc);
    const retained = !doc.querySelector('#layout')!.hasAttribute('data-pptx-editable') && !!doc.querySelector('[data-pptx-editable="title"]');
    iframe.remove();
    return { retained, url: charterFontUrl(['DM Sans', 'Cormorant Garamond']), generic: charterFontUrl(['Georgia', 'Arial']) };
  });
  expect(result.retained).toBe(true);
  expect(result.url).toContain('family=DM%20Sans');
  expect(result.url).toContain('family=Cormorant%20Garamond');
  expect(result.generic).toBeNull();
});
