import { IngestChunk } from "./client.js";

export interface TrackedChunk {
  id: string;
  title: string;
  category: string;
  slug: string;
  content: string;
  tokenCount: number;
  lastUpdated: string;
}

export interface ProjectInfo {
  libraryId: string;
  name: string;
  description?: string;
  version?: string;
}

export class ProjectState {
  project: ProjectInfo | null = null;
  private chunks: Map<string, TrackedChunk> = new Map();
  private dirty = false;

  init(info: ProjectInfo): void {
    this.project = info;
    this.chunks.clear();
    this.dirty = false;
  }

  isInitialized(): boolean {
    return this.project !== null;
  }

  assertInitialized(): ProjectInfo {
    if (!this.project) {
      throw new Error("No project initialized. Call init-project first.");
    }
    return this.project;
  }

  makeChunkId(category: string, slug: string): string {
    return `${this.project!.libraryId}:${category}:${slug}`;
  }

  getChunk(id: string): TrackedChunk | undefined {
    return this.chunks.get(id);
  }

  setChunk(chunk: TrackedChunk): void {
    this.chunks.set(chunk.id, chunk);
    this.dirty = true;
  }

  removeChunk(id: string): boolean {
    const deleted = this.chunks.delete(id);
    if (deleted) this.dirty = true;
    return deleted;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markClean(): void {
    this.dirty = false;
  }

  listChunks(): TrackedChunk[] {
    return Array.from(this.chunks.values());
  }

  getAllChunksForIngest(): IngestChunk[] {
    return this.listChunks().map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      tokenCount: c.tokenCount,
    }));
  }
}
