
export enum ToolMode {
  WIKI_GEN = 'wiki_gen',
  RAG_CHAT = 'rag_chat',
  DEEP_RESEARCH = 'deep_research',
  SIMPLE_CHAT = 'simple_chat'
}

export interface RepoContext {
  repoName: string;
  repoUrl: string;
  repoType: string;
  files: RepoFile[];
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface WikiPage {
  id: string;
  title: string;
  description: string;
  importance: string;
  relevant_files: string[];
  related_pages: string[];
  parent_section?: string;
  technical_breakdown?: string;
  code_samples?: string[];
}

export interface WikiStructure {
  title: string;
  description: string;
  sections?: Array<{ id: string; title: string; pages: string[] }>;
  pages: WikiPage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  iteration?: number;
}

export interface AppSettings {
  selectedModel: string;
  githubToken: string;
}

export interface SessionData {
  version: string;
  timestamp: string;
  mode: ToolMode;
  repo: RepoContext;
  wiki: WikiStructure | null;
  chatHistory: ChatMessage[];
  researchIteration: number;
  settings: AppSettings;
}
