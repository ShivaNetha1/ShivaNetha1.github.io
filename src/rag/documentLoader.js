import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.md', '.txt', '.json']);

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function extractText(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (extension === '.json') {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.stringify(JSON.parse(raw), null, 2);
  }

  return fs.readFile(filePath, 'utf8');
}

function inferSection(relativePath) {
  const directory = path.dirname(relativePath);
  if (!directory || directory === '.') {
    return path.basename(relativePath, path.extname(relativePath));
  }

  return directory
    .split(path.sep)
    .filter(Boolean)
    .join(' / ');
}

function extractTags(text) {
  const tagLine = text
    .split(/\r?\n/)
    .slice(0, 40)
    .find(line => /^tags?\s*[:\-]/i.test(line.trim()));

  if (!tagLine) {
    return [];
  }

  return tagLine
    .replace(/^tags?\s*[:\-]\s*/i, '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function loadDocuments({ kbDir }) {
  const absoluteKbDir = path.resolve(kbDir);
  const stat = await fs.stat(absoluteKbDir).catch(() => null);

  if (!stat?.isDirectory()) {
    throw new Error(`Knowledge base directory not found: ${absoluteKbDir}`);
  }

  const filePaths = await walkFiles(absoluteKbDir);
  const documents = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(absoluteKbDir, filePath);

    try {
      const text = normalizeText(await extractText(filePath));

      if (!text) {
        console.warn(`Skipping empty KB document: ${relativePath}`);
        continue;
      }

      documents.push({
        text,
        metadata: {
          section: inferSection(relativePath),
          documentName: path.basename(filePath),
          sourcePath: path.join('KB', relativePath).replace(/\\/g, '/'),
          tags: extractTags(text),
        },
      });
    } catch (error) {
      console.warn(`Skipping unreadable KB document: ${relativePath}`, error.message);
    }
  }

  return documents;
}



