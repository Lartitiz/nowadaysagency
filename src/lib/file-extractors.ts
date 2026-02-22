/**
 * Client-side text extraction from uploaded files.
 * Supports: .txt, .pdf, .docx
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'txt' || ext === 'md') {
    return file.text();
  }

  if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => item.str)
        .join(' ');
      pages.push(text);
    }
    return pages.join('\n\n');
  }

  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error(`Format non supporté : .${ext}. Utilise un fichier PDF, Word ou texte.`);
}

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md'];

export function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? ACCEPTED_EXTENSIONS.includes(ext) : false;
}

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
].join(',');
