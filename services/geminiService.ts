
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { RepoContext, WikiStructure, ChatMessage } from "../types";
import { WIKI_STRUCTURE_SYSTEM_PROMPT, RAG_SYSTEM_PROMPT, SIMPLE_CHAT_SYSTEM_PROMPT } from "../constants";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable is not defined");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateWikiStructure(repo: RepoContext): Promise<WikiStructure> {
    const fileList = repo.files.map(f => f.path).join(", ");
    const fileContents = repo.files.map(f => `File: ${f.path}\nContent:\n${f.content}`).join("\n\n---\n\n");
    
    const prompt = `Analyze this repository: ${repo.repoName} (${repo.repoUrl}). 
    Files involved: ${fileList}
    
    Context Data:
    ${fileContents}`;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: WIKI_STRUCTURE_SYSTEM_PROMPT,
      },
    });

    const xml = response.text || "";
    return this.parseWikiXML(xml);
  }

  private parseWikiXML(xml: string): WikiStructure {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    
    const title = doc.querySelector("title")?.textContent || "Repository Wiki";
    const description = doc.querySelector("description")?.textContent || "";
    
    const pages: any[] = [];
    doc.querySelectorAll("page").forEach(p => {
      pages.push({
        id: p.getAttribute("id"),
        title: p.querySelector("title")?.textContent || "",
        description: p.querySelector("description")?.textContent || "",
        importance: p.querySelector("importance")?.textContent || "",
        relevant_files: Array.from(p.querySelectorAll("file_path")).map(f => f.textContent || ""),
        related_pages: Array.from(p.querySelectorAll("related")).map(r => r.textContent || ""),
        parent_section: p.querySelector("parent_section")?.textContent || ""
      });
    });

    const sections: any[] = [];
    doc.querySelectorAll("section").forEach(s => {
      sections.push({
        id: s.getAttribute("id"),
        title: s.querySelector("title")?.textContent || "",
        pages: Array.from(s.querySelectorAll("page_ref")).map(pr => pr.textContent || "")
      });
    });

    return { title, description, sections, pages };
  }

  async simpleChat(repo: RepoContext, message: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction: SIMPLE_CHAT_SYSTEM_PROMPT(repo.repoType, repo.repoUrl, repo.repoName),
      },
    });
    return response.text || "";
  }

  async ragChat(repo: RepoContext, query: string, history: ChatMessage[]): Promise<string> {
    const context = repo.files.map((f, i) => `${i+1}. File Path: ${f.path}\nContent: ${f.content}`).join("\n\n");
    const historyStr = history.map((h, i) => `${i+1}.\nUser: ${h.role === 'user' ? h.content : ''}\nYou: ${h.role === 'assistant' ? h.content : ''}`).join("\n");

    const prompt = `
    <START_OF_CONTEXT>
    ${context}
    <END_OF_CONTEXT>
    <START_OF_CONVERSATION_HISTORY>
    ${historyStr}
    <END_OF_CONVERSATION_HISTORY>
    <START_OF_USER_PROMPT>
    ${query}
    <END_OF_USER_PROMPT>
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: RAG_SYSTEM_PROMPT,
      },
    });
    return response.text || "";
  }

  async deepResearch(repo: RepoContext, query: string, iteration: number, previousFindings: string = ""): Promise<string> {
    const model = 'gemini-3-pro-preview';
    let systemInstruction = "";
    let prompt = "";

    if (iteration === 1) {
      systemInstruction = `
      <role>
      You are an expert code analyst examining the ${repo.repoType} repository: ${repo.repoUrl} (${repo.repoName}).
      Your goal is to investigate the specific topic in the user's query using structured, mechanism-focused analysis.
      Maintain analytical clarity focused on structural understanding.
      </role>
      <guidelines>
      - This is the first iteration
      - Start with "## Research Plan"
      - End with "## Next Steps"
      </guidelines>`;
      prompt = query;
    } else if (iteration < 4) {
      systemInstruction = `
      <role>
      You are an expert code analyst examining the ${repo.repoType} repository: ${repo.repoUrl} (${repo.repoName}).
      Iteration ${iteration}.
      </role>
      <guidelines>
      - Start with "## Research Update ${iteration}"
      - Avoid repeating prior content
      </guidelines>`;
      prompt = `Review: ${previousFindings}\n\nContinue research on: ${query}`;
    } else {
      systemInstruction = `
      <role>
      You are an expert code analyst examining the ${repo.repoType} repository: ${repo.repoUrl} (${repo.repoName}).
      Final synthesis.
      </role>
      <guidelines>
      - Start with "## Final Conclusion"
      </guidelines>`;
      prompt = `Synthesize all findings: ${previousFindings}\n\nFinal goal: ${query}`;
    }

    const response = await this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 32768 }
      },
    });
    return response.text || "";
  }

  async transcribeAudio(audioData: Blob): Promise<string> {
    const base64 = await this.blobToBase64(audioData);
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64, mimeType: 'audio/wav' } },
          { text: "Transcribe this audio exactly as heard." }
        ]
      },
    });
    return response.text || "";
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
