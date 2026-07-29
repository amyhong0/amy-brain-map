import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

const USE_VERCEL_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: 'pdf' | 'web' | 'image';
  tags: string[];
  createdAt: string;
  summary?: string;
  content?: string;
  url?: string;
  metadata?: {
    topic?: string;
    entityType?: string;
    [key: string]: any;
  };
}

function normalizeTags(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
}

// 개발 환경용 로컬 저장소 초기화
async function ensureLocalDir() {
  try {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to initialize local knowledge dir:', error);
  }
}

function getDocFileName(docId: string): string {
  return `${docId}.md`;
}

// Vercel Blob 사용 (배포 환경)
async function withBlob<T>(fn: () => Promise<T>): Promise<T> {
  if (!USE_VERCEL_BLOB) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured');
  }
  const { put, list, del } = await import('@vercel/blob');
  return fn();
}

// 모든 문서 로드
export async function loadKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  try {
    if (USE_VERCEL_BLOB) {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({
        prefix: 'knowledge/',
        limit: 100,
      });

      const docs: KnowledgeDoc[] = [];
      for (const blob of blobs) {
        if (!blob.url.endsWith('.md')) continue;

        const response = await fetch(blob.url);
        const content = await response.text();
        const { data } = matter(content);

        docs.push({
          id: data.id || blob.pathname.replace('knowledge/', '').replace('.md', ''),
          title: data.title || 'Untitled',
          type: data.type || 'web',
          tags: normalizeTags(data.tags),
          createdAt: data.createdAt || new Date().toISOString(),
          summary: data.summary,
          content: content.replace(/^---[\s\S]*?---/, '').trim(),
          url: data.url,
          metadata: (data.metadata as KnowledgeDoc['metadata']) || (data.topic ? { topic: data.topic } : undefined),
        });
      }

      return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // 로컬 파일시스템 모드
    await ensureLocalDir();
    const files = await fs.readdir(KNOWLEDGE_DIR);
    const docs: KnowledgeDoc[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(KNOWLEDGE_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const { data } = matter(content);

      docs.push({
        id: data.id || file.replace('.md', ''),
        title: data.title || 'Untitled',
        type: data.type || 'web',
        tags: normalizeTags(data.tags),
        createdAt: data.createdAt || new Date().toISOString(),
        summary: data.summary,
        content: content.replace(/^---[\s\S]*?---/, '').trim(),
        url: data.url,
        metadata: (data.metadata as KnowledgeDoc['metadata']) || (data.topic ? { topic: data.topic } : undefined),
      });
    }

    return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Failed to load knowledge docs:', error);
    return [];
  }
}

// 단일 문서 저장
export async function saveKnowledgeDoc(doc: KnowledgeDoc): Promise<string> {
  const metadata: Record<string, unknown> = {
    id: doc.id || 'unknown',
    title: doc.title || 'Untitled',
    type: doc.type || 'web',
    tags: normalizeTags(doc.tags),
    createdAt: doc.createdAt || new Date().toISOString(),
  };

  if (doc.summary) metadata.summary = doc.summary;
  if (doc.url) metadata.url = doc.url;
  if (doc.metadata?.topic) metadata.topic = doc.metadata.topic;
  if (doc.metadata?.entityType) metadata.entityType = doc.metadata.entityType;
  if (doc.metadata) {
    for (const [key, value] of Object.entries(doc.metadata)) {
      if (key !== 'topic' && key !== 'entityType' && value !== undefined) {
        metadata[key] = value;
      }
    }
  }

  const mdContent = matter.stringify(doc.content || doc.summary || '', metadata);
  const fileName = getDocFileName(doc.id);
  const pathname = `knowledge/${fileName}`;

  if (USE_VERCEL_BLOB) {
    const { put } = await import('@vercel/blob');
    const blob = await put(pathname, mdContent, {
      access: 'public',
      contentType: 'text/markdown',
    });

    return blob.url;
  }

  // 로컬 파일시스템 모드
  await ensureLocalDir();
  const filePath = path.join(KNOWLEDGE_DIR, fileName);
  await fs.writeFile(filePath, mdContent, 'utf-8');
  return `file://${filePath}`;
}

// 단일 문서 삭제
export async function deleteKnowledgeDoc(docId: string): Promise<void> {
  const fileName = getDocFileName(docId);

  if (USE_VERCEL_BLOB) {
    try {
      const { list, del } = await import('@vercel/blob');
      const { blobs } = await list({
        prefix: `knowledge/${fileName}`,
        limit: 1,
      });

      if (blobs.length > 0) {
        await del(blobs[0].url);
      }
    } catch (error) {
      console.error(`Failed to delete doc ${docId}:`, error);
    }
    return;
  }

  // 로컬 파일시스템 모드
  try {
    await ensureLocalDir();
    const filePath = path.join(KNOWLEDGE_DIR, fileName);
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Failed to delete doc ${docId}:`, error);
  }
}