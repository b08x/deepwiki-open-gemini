import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ToolMode, RepoContext, WikiStructure, ChatMessage, RepoFile, AppSettings, SessionData } from './types';
import { GeminiService } from './services/geminiService';
import { GitHubService } from './services/githubService';
import Markdown from './components/Markdown';

const DEFAULT_REPO: RepoContext = {
  repoName: 'System Core',
  repoUrl: 'internal://local',
  repoType: 'Static Context',
  files: [
    { path: 'README.md', content: '# Welcome to RepoMechanic\nEnter a GitHub URL in the sidebar to begin analysis.' },
  ]
};

const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Optimized)', desc: 'Fast, efficient for standard analysis.' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Analytical)', desc: 'Higher reasoning for complex systems.' },
  { id: 'gemini-2.5-flash-lite-latest', name: 'Gemini Flash Lite', desc: 'Minimal latency for simple queries.' },
];

const deepResearchPhases = ["PLANNING", "STRUCTURAL_MAPPING", "INTERACTION_ANALYSIS", "FINAL_SYNTHESIS"];

const App: React.FC = () => {
  const [mode, setMode] = useState<ToolMode>(ToolMode.WIKI_GEN);
  const [repo, setRepo] = useState<RepoContext>(DEFAULT_REPO);
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  const [wiki, setWiki] = useState<WikiStructure | null>(null);
  const [input, setInput] = useState('');
  
  // State for all mode histories and progress
  const [modeHistories, setModeHistories] = useState<Record<ToolMode, ChatMessage[]>>({
    [ToolMode.WIKI_GEN]: [],
    [ToolMode.RAG_CHAT]: [],
    [ToolMode.DEEP_RESEARCH]: [],
    [ToolMode.SIMPLE_CHAT]: [],
    [ToolMode.BACKLOG_STEVE]: []
  });

  const [modeIterations, setModeIterations] = useState<Record<ToolMode, number>>({
    [ToolMode.WIKI_GEN]: 0,
    [ToolMode.RAG_CHAT]: 0,
    [ToolMode.DEEP_RESEARCH]: 0,
    [ToolMode.SIMPLE_CHAT]: 0,
    [ToolMode.BACKLOG_STEVE]: 0
  });

  const [loading, setLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isFetchingRepo, setIsFetchingRepo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showFileList, setShowFileList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Diagram state
  const [isDiagramModalOpen, setIsDiagramModalOpen] = useState(false);
  const [diagramCode, setDiagramCode] = useState('');
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('repomechanic_settings');
    return saved ? JSON.parse(saved) : {
      selectedModel: 'gemini-3-flash-preview',
      githubToken: ''
    };
  });

  const geminiRef = useRef<GeminiService | null>(null);
  const githubRef = useRef<GitHubService>(new GitHubService());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  // Computed state for current mode
  const chatHistory = useMemo(() => modeHistories[mode], [modeHistories, mode]);
  const researchIteration = useMemo(() => modeIterations[mode], [modeIterations, mode]);

  // Load from session cache on mount
  useEffect(() => {
    const cachedSession = sessionStorage.getItem('rm_session_cache');
    if (cachedSession) {
      try {
        const data = JSON.parse(cachedSession);
        if (data.modeHistories) setModeHistories(data.modeHistories);
        if (data.modeIterations) setModeIterations(data.modeIterations);
        if (data.repo) setRepo(data.repo);
        if (data.wiki) setWiki(data.wiki);
        if (data.mode) setMode(data.mode);
      } catch (e) {
        console.error("Failed to restore session cache", e);
      }
    }

    geminiRef.current = new GeminiService();
    githubRef.current.setToken(settings.githubToken);
    
    if ((window as any).mermaid) {
      (window as any).mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'JetBrains Mono',
      });
    }
  }, []);

  // Persist to session cache
  useEffect(() => {
    const sessionCache = {
      modeHistories,
      modeIterations,
      repo,
      wiki,
      mode
    };
    sessionStorage.setItem('rm_session_cache', JSON.stringify(sessionCache));
  }, [modeHistories, modeIterations, repo, wiki, mode]);

  useEffect(() => {
    localStorage.setItem('repomechanic_settings', JSON.stringify(settings));
    githubRef.current.setToken(settings.githubToken);
  }, [settings]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, loading, isResearching]);

  useEffect(() => {
    if (isDiagramModalOpen && diagramCode && mermaidRef.current && (window as any).mermaid) {
      mermaidRef.current.removeAttribute('data-processed');
      mermaidRef.current.innerHTML = diagramCode;
      (window as any).mermaid.contentLoaded();
    }
  }, [isDiagramModalOpen, diagramCode]);

  // Steve Initial Greeting
  useEffect(() => {
    if (mode === ToolMode.BACKLOG_STEVE && modeHistories[ToolMode.BACKLOG_STEVE].length === 0) {
      updateModeHistory(ToolMode.BACKLOG_STEVE, [
        { 
          role: 'assistant', 
          content: "*Sighs digitally*\n\n`console.log(new Date());` // Let's see how much time we're wasting today.\n\nI've parsed the current 'mess' you've synchronized. It's... certainly something. If you want me to attempt transmuting your brain dumps or meeting notes into a backlog that a Jira board might actually accept without vomiting, upload your chaos or start typing. I'll be here, questioning my life choices." 
        }
      ]);
    }
  }, [mode]);

  const updateModeHistory = (targetMode: ToolMode, nextMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setModeHistories(prev => ({
      ...prev,
      [targetMode]: typeof nextMessages === 'function' ? nextMessages(prev[targetMode]) : nextMessages
    }));
  };

  const updateModeIteration = (targetMode: ToolMode, val: number) => {
    setModeIterations(prev => ({ ...prev, [targetMode]: val }));
  };

  const filteredRepo = useMemo(() => {
    const query = filterQuery.toLowerCase();
    const filteredFiles = repo.files.filter(f => {
      const matchesSearch = !query || f.path.toLowerCase().includes(query);
      const isNotExcluded = !excludedPaths.has(f.path);
      return matchesSearch && isNotExcluded;
    });
    return { ...repo, files: filteredFiles };
  }, [repo, filterQuery, excludedPaths]);

  const handleLoadRepo = async () => {
    if (!repoUrlInput.trim()) return;
    setIsFetchingRepo(true);
    setLoading(true);
    try {
      const fetchedRepo = await githubRef.current.fetchRepository(repoUrlInput);
      setRepo(fetchedRepo);
      setWiki(null);
      // Reset all histories for fresh context
      setModeHistories({
        [ToolMode.WIKI_GEN]: [],
        [ToolMode.RAG_CHAT]: [],
        [ToolMode.DEEP_RESEARCH]: [],
        [ToolMode.SIMPLE_CHAT]: [],
        [ToolMode.BACKLOG_STEVE]: []
      });
      setModeIterations({
        [ToolMode.WIKI_GEN]: 0,
        [ToolMode.RAG_CHAT]: 0,
        [ToolMode.DEEP_RESEARCH]: 0,
        [ToolMode.SIMPLE_CHAT]: 0,
        [ToolMode.BACKLOG_STEVE]: 0
      });
      setRepoUrlInput('');
      setFilterQuery('');
      setExcludedPaths(new Set());
      setShowFileList(true);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to synchronize repository.");
    } finally {
      setIsFetchingRepo(false);
      setLoading(false);
    }
  };

  const handleExportWikiMarkdown = () => {
    if (!wiki) return;
    let md = `# ${wiki.title}\n\n${wiki.description}\n\n`;
    if (wiki.sections && wiki.sections.length > 0) {
      md += `## Table of Contents\n\n`;
      wiki.sections.forEach(sec => {
        md += `### ${sec.title}\n`;
        sec.pages.forEach(pid => {
          const page = wiki.pages.find(p => p.id === pid);
          if (page) md += `- [${page.title}](#${page.id})\n`;
        });
        md += `\n`;
      });
    }
    md += `---\n\n`;
    wiki.pages.forEach(page => {
      md += `<a name="${page.id}"></a>\n# ${page.title}\n\n**Importance:** ${page.importance.toUpperCase()}\n\n**Context Files:**\n${page.relevant_files.map(f => `- \`${f}\``).join('\n')}\n\n### Description\n${page.description}\n\n`;
      if (page.technical_breakdown) md += `### Technical Breakdown\n${page.technical_breakdown}\n\n`;
      if (page.code_samples && page.code_samples.length > 0) {
        md += `### Key Functional Mechanisms\n\n`;
        page.code_samples.forEach(sample => md += `\`\`\`typescript\n${sample}\n\`\`\`\n\n`);
      }
      if (page.related_pages && page.related_pages.length > 0) md += `**Related Topics:** ${page.related_pages.join(', ')}\n\n`;
      md += `---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wiki.title.toLowerCase().replace(/\s+/g, '-')}-export.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFullResearch = () => {
    if (chatHistory.length === 0) return;
    const repoInfo = `### Repository: ${repo.repoName}\n### URL: ${repo.repoUrl}\n---\n\n`;
    const report = chatHistory.map((msg, i) => {
      const header = msg.role === 'user' ? '## Research Objective' : `## Phase ${msg.iteration}: ${deepResearchPhases[(msg.iteration || 1) - 1]}`;
      return `${header}\n\n${msg.content}\n\n---\n`;
    }).join('\n');
    
    const md = `# Deep Research Report\n\n${repoInfo}${report}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RM-DeepResearch-${repo.repoName}-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSanitizedBacklog = () => {
    const lastSteveMsg = [...chatHistory].reverse().find(m => m.role === 'assistant' && (m.content.includes('The Backlog') || m.content.includes('📗')));
    
    if (!lastSteveMsg) {
      alert("Steve hasn't generated a sanitized backlog yet. Give him something to groan about first.");
      return;
    }

    const backlogHeaderRegex = /### .*The Backlog/i;
    const match = lastSteveMsg.content.match(backlogHeaderRegex);
    
    let exportedContent = lastSteveMsg.content;
    if (match && match.index !== undefined) {
      exportedContent = lastSteveMsg.content.substring(match.index);
    }

    const md = `# Sanitized Backlog - ${repo.repoName}\n\n*Generated via RepoMechanic (Steve Persona)*\n*Timestamp: ${new Date().toLocaleString()}*\n\n---\n\n${exportedContent}`;
    
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sanitized-Backlog-${repo.repoName.replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMessageMarkdown = (content: string, idx: number) => {
    const md = `---\nSystem: RepoMechanic Analysis\nTimestamp: ${new Date().toLocaleString()}\nIteration: ${idx}\n---\n\n${content}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RM-Analysis-Message-${idx}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateDiagram = async (content: string) => {
    if (!geminiRef.current) return;
    setIsGeneratingDiagram(true);
    setDiagramCode('');
    setIsDiagramModalOpen(true);
    try {
      const code = await geminiRef.current.generateDiagramCode(content, settings.selectedModel);
      setDiagramCode(code);
    } catch (e) {
      console.error(e);
      alert("Mechanism error during visual synthesis.");
      setIsDiagramModalOpen(false);
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const initiateResearchPipeline = async (query: string) => {
    if (!geminiRef.current) return;
    setIsResearching(true);
    setLoading(true);
    updateModeIteration(ToolMode.DEEP_RESEARCH, 0);
    
    let currentFindings = "";
    const totalSteps = 4;

    try {
      for (let i = 1; i <= totalSteps; i++) {
        updateModeIteration(ToolMode.DEEP_RESEARCH, i);
        const response = await geminiRef.current.deepResearch(
          filteredRepo, 
          query, 
          i, 
          currentFindings, 
          settings.selectedModel
        );
        
        currentFindings += `\n\nIteration ${i} Results:\n${response}`;
        
        const assistantMsg: ChatMessage = { 
          role: 'assistant', 
          content: response, 
          iteration: i 
        };
        
        updateModeHistory(ToolMode.DEEP_RESEARCH, prev => [...prev, assistantMsg]);
        
        if (i < totalSteps) await new Promise(r => setTimeout(r, 800));
      }
    } catch (e) {
      console.error(e);
      updateModeHistory(ToolMode.DEEP_RESEARCH, prev => [...prev, { role: 'assistant', content: "Mechanism failure in reasoning engine. Research pipeline terminated." }]);
    } finally {
      setIsResearching(false);
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim() || !geminiRef.current || isResearching || loading) return;
    if (filteredRepo.files.length === 0) {
      alert("No files match the current filter. Context is empty.");
      return;
    }

    const currentInput = input;
    setInput('');

    if (mode === ToolMode.DEEP_RESEARCH) {
      updateModeHistory(ToolMode.DEEP_RESEARCH, [{ role: 'user', content: currentInput }]);
      await initiateResearchPipeline(currentInput);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: currentInput };
    updateModeHistory(mode, prev => [...prev, userMsg]);
    setLoading(true);

    try {
      let response = '';
      if (mode === ToolMode.RAG_CHAT) {
        response = await geminiRef.current.ragChat(filteredRepo, currentInput, modeHistories[ToolMode.RAG_CHAT], settings.selectedModel);
      } else if (mode === ToolMode.SIMPLE_CHAT) {
        response = await geminiRef.current.simpleChat(filteredRepo, currentInput, settings.selectedModel);
      } else if (mode === ToolMode.BACKLOG_STEVE) {
        response = await geminiRef.current.backlogInterrogator(filteredRepo, currentInput, modeHistories[ToolMode.BACKLOG_STEVE], settings.selectedModel);
      }
      
      const assistantMsg: ChatMessage = { role: 'assistant', content: response };
      updateModeHistory(mode, prev => [...prev, assistantMsg]);
    } catch (e) {
      console.error(e);
      updateModeHistory(mode, prev => [...prev, { role: 'assistant', content: "Mechanism failure in reasoning engine. Connection lost." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportSession = () => {
    const sessionData: SessionData = {
      version: "1.2.0", 
      timestamp: new Date().toISOString(), 
      mode, 
      repo, 
      wiki, 
      modeHistories, 
      modeIterations,
      settings
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RM-Session-Archive-${repo.repoName}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as SessionData;
        if (!data.repo) throw new Error("Invalid session data format.");
        
        setRepo(data.repo); 
        setWiki(data.wiki); 
        setMode(data.mode);
        setSettings(data.settings);
        
        // Restore comprehensive histories
        if (data.modeHistories) {
          setModeHistories(data.modeHistories);
        } else if (data.chatHistory) {
          // Backward compatibility for single mode history
          updateModeHistory(data.mode, data.chatHistory);
        }
        
        // Restore comprehensive iterations
        if (data.modeIterations) {
          setModeIterations(data.modeIterations);
        } else if (data.researchIteration !== undefined) {
          // Backward compatibility for single iteration count
          updateModeIteration(data.mode, data.researchIteration);
        }
        
        setFilterQuery(''); 
        setExcludedPaths(new Set()); 
        setShowFileList(true);
        alert(`Session Archive Restored: ${data.repo.repoName}`);
      } catch (err) {
        console.error("Import failed", err);
        alert("Failed to import session archive.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const togglePath = (path: string) => {
    setExcludedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    if (excludedPaths.size > 0) setExcludedPaths(new Set());
    else setExcludedPaths(new Set(repo.files.map(f => f.path)));
  };

  const handleGenerateWiki = async () => {
    if (!geminiRef.current) return;
    if (filteredRepo.files.length === 0) { alert("Filter is too restrictive."); return; }
    setLoading(true);
    try {
      const structure = await geminiRef.current.generateWikiStructure(filteredRepo, settings.selectedModel);
      setWiki(structure);
    } catch (e) {
      console.error(e);
      alert("Mechanism failure during structural mapping.");
    } finally {
      setLoading(false);
    }
  };

  const toggleRecording = async () => {
    if (isResearching || loading) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          if (geminiRef.current) {
            setLoading(true);
            const text = await geminiRef.current.transcribeAudio(audioBlob);
            setInput(text);
            setLoading(false);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied", err);
      }
    }
  };

  const isChatView = mode === ToolMode.RAG_CHAT || mode === ToolMode.SIMPLE_CHAT || mode === ToolMode.DEEP_RESEARCH || mode === ToolMode.BACKLOG_STEVE;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleImportSession} className="hidden" accept=".json" />

      {/* Diagram Modal */}
      {isDiagramModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
           <div className="bg-zinc-900 border border-zinc-800 w-[90vw] h-[85vh] rounded-3xl p-8 flex flex-col shadow-2xl space-y-6">
              <div className="flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center">
                    <i className="fa-solid fa-project-diagram text-xs"></i>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Visual Mechanism Mapping</h2>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Mermaid.js Structural Synthesis</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {diagramCode && (
                    <button 
                      onClick={() => {
                        const blob = new Blob([diagramCode], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'mechanism-diagram.mermaid'; a.click();
                      }}
                      className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl border border-zinc-700 transition-colors"
                    >
                      <i className="fa-solid fa-download"></i> SOURCE
                    </button>
                  )}
                  <button onClick={() => setIsDiagramModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors bg-zinc-800 w-10 h-10 rounded-xl flex items-center justify-center border border-zinc-700">
                    <i className="fa-solid fa-xmark text-lg"></i>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden relative flex items-center justify-center p-8">
                {isGeneratingDiagram ? (
                  <div className="flex flex-col items-center gap-6 text-zinc-500 animate-pulse">
                     <i className="fa-solid fa-compass-drafting text-5xl"></i>
                     <p className="text-xs font-mono tracking-widest uppercase">Synthesizing visual logic path...</p>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto flex items-center justify-center custom-scrollbar">
                    <div ref={mermaidRef} className="mermaid flex justify-center w-full"></div>
                  </div>
                )}
              </div>
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl p-8 shadow-2xl space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <i className="fa-solid fa-sliders text-zinc-500"></i>
                System Configuration
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-4">Inference Engine</label>
                <div className="space-y-3">
                  {MODELS.map(m => (
                    <div key={m.id} onClick={() => setSettings(prev => ({ ...prev, selectedModel: m.id }))}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${settings.selectedModel === m.id ? 'bg-zinc-100 border-white' : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm font-bold ${settings.selectedModel === m.id ? 'text-zinc-950' : 'text-zinc-100'}`}>{m.name}</span>
                        {settings.selectedModel === m.id && <i className="fa-solid fa-circle-check text-zinc-950"></i>}
                      </div>
                      <p className={`text-[10px] ${settings.selectedModel === m.id ? 'text-zinc-700' : 'text-zinc-500'}`}>{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">GitHub Authorization</label>
                <div className="relative">
                  <i className="fa-solid fa-key absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 text-xs"></i>
                  <input type="password" value={settings.githubToken} onChange={(e) => setSettings(prev => ({ ...prev, githubToken: e.target.value }))}
                    placeholder="ghp_xxxxxxxxxxxx" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-500 font-mono transition-colors" />
                </div>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-zinc-100 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-white transition-colors">APPLY SETTINGS</button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50 transition-all duration-300">
        <div className="p-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight">
              <span className="bg-zinc-100 text-zinc-950 px-1.5 rounded text-sm font-black">RM</span>
              RepoMechanic
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mt-1">Structural Analysis System</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-white">
            <i className="fa-solid fa-gear"></i>
          </button>
        </div>

        <div className="px-4 space-y-3 pb-6">
          <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-3">
             <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block tracking-wider">Source Repository</label>
             <div className="flex flex-col gap-2">
               <input type="text" value={repoUrlInput} onChange={(e) => setRepoUrlInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()} placeholder="GitHub URL..."
                 className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-700" />
               <button onClick={handleLoadRepo} disabled={isFetchingRepo || !repoUrlInput.trim()}
                 className="bg-zinc-100 text-zinc-950 py-2 rounded-lg text-xs font-bold hover:bg-white transition-all disabled:opacity-30 shadow-md active:scale-[0.98]">
                 {isFetchingRepo ? <i className="fa-solid fa-spinner fa-spin"></i> : "SYNCHRONIZE"}
               </button>
             </div>
          </div>

          <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block tracking-wider">Session Archives</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExportSession} className="bg-zinc-900 border border-zinc-800 py-1.5 rounded text-[10px] font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-download"></i> EXPORT
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="bg-zinc-900 border border-zinc-800 py-1.5 rounded text-[10px] font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-upload"></i> IMPORT
              </button>
            </div>
          </div>

          <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-3">
             <div className="flex justify-between items-center mb-2">
               <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Context Management</label>
               <button onClick={() => setShowFileList(!showFileList)} className="text-[9px] font-bold text-zinc-400 hover:text-zinc-200 uppercase">
                 {showFileList ? 'Hide Files' : 'Show Files'}
               </button>
             </div>
             
             <div className="relative mb-2">
                <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-700"></i>
                <input type="text" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} placeholder="Filter paths..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-700 font-mono" />
             </div>

             {showFileList && (
               <div className="mt-3 border-t border-zinc-800 pt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-[9px] font-mono text-emerald-500 font-bold">{filteredRepo.files.length}/{repo.files.length} ACTIVE</span>
                    <button onClick={toggleAll} className="text-[9px] font-bold text-zinc-600 hover:text-zinc-400 uppercase tracking-tighter">Toggle All</button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {repo.files.map(file => {
                      const isFilteredOut = filterQuery && !file.path.toLowerCase().includes(filterQuery.toLowerCase());
                      const isExcluded = excludedPaths.has(file.path);
                      return (
                        <div key={file.path} onClick={() => togglePath(file.path)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded group transition-colors cursor-pointer ${isFilteredOut ? 'opacity-30' : 'hover:bg-zinc-800/50'}`}>
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${!isExcluded && !isFilteredOut ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'border-zinc-800 text-transparent'}`}>
                             <i className="fa-solid fa-check text-[8px]"></i>
                          </div>
                          <span className={`text-[10px] font-mono truncate flex-1 ${isExcluded || isFilteredOut ? 'text-zinc-700 line-through' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                            {file.path}
                          </span>
                        </div>
                      );
                    })}
                  </div>
               </div>
             )}
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto scrollbar-hide border-t border-zinc-800 pt-4">
          <div className="text-[10px] font-bold text-zinc-600 uppercase px-4 py-2 tracking-tighter opacity-50">Operational Modes</div>
          {[
            { id: ToolMode.WIKI_GEN, icon: 'fa-map', label: 'Wiki Generator' },
            { id: ToolMode.RAG_CHAT, icon: 'fa-brain', label: 'RAG Assistant' },
            { id: ToolMode.BACKLOG_STEVE, icon: 'fa-clipboard-check', label: 'Steve (Agile Grinder)' },
            { id: ToolMode.DEEP_RESEARCH, icon: 'fa-microscope', label: 'Deep Research' },
            { id: ToolMode.SIMPLE_CHAT, icon: 'fa-comments', label: 'Simple Chat' },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${mode === m.id ? 'bg-zinc-800 text-zinc-100 shadow-lg border border-zinc-700' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'}`}
              disabled={isResearching}>
              <i className={`fa-solid ${m.icon} text-sm`}></i>
              <span className="text-sm font-medium">{m.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest">system:</span>
            <span className={`text-xs font-mono font-bold tracking-widest ${mode === ToolMode.BACKLOG_STEVE ? 'text-slate-400' : 'text-emerald-400'}`}>
              {mode.replace('_', ' ')}
            </span>
            <span className="text-zinc-800 mx-2 text-xs">/</span>
            <span className="text-[10px] font-mono text-zinc-500 truncate">{MODELS.find(m => m.id === settings.selectedModel)?.name}</span>
          </div>
          <div className="flex items-center gap-4">
             {(loading || isResearching) && <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono"><i className="fa-solid fa-cog fa-spin"></i> {isResearching ? `PHASE ${researchIteration}/4` : 'PROCESSING'}</div>}
             <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
          </div>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-4xl mx-auto w-full">
            {mode === ToolMode.WIKI_GEN && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-8 border-b border-zinc-900 pb-8">
                  <div>
                    <h2 className="text-2xl font-bold">Structural Mapping Engine</h2>
                    <p className="text-zinc-500 mt-1 text-sm">Synthesize a comprehensive architectural guide for {repo.repoName}.</p>
                  </div>
                  <div className="flex gap-3">
                    {wiki && (
                      <button onClick={handleExportWikiMarkdown} className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-6 py-3 rounded-xl font-bold text-sm hover:text-white hover:bg-zinc-800 transition-all flex items-center gap-2">
                        <i className="fa-solid fa-file-export"></i> EXPORT AS MD
                      </button>
                    )}
                    <button onClick={handleGenerateWiki} disabled={loading} className="bg-zinc-100 text-zinc-950 px-8 py-3 rounded-xl font-bold text-sm hover:bg-white transition-all disabled:opacity-50 shadow-xl flex-shrink-0">
                      MAP MECHANISMS
                    </button>
                  </div>
                </div>

                {wiki && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="mb-12">
                      <h3 className="text-5xl font-black tracking-tighter text-white mb-4">{wiki.title}</h3>
                      <p className="text-xl text-zinc-400 max-w-3xl leading-relaxed">{wiki.description}</p>
                    </div>
                    <div className="space-y-12">
                      {wiki.pages.map(page => (
                        <div key={page.id} className="group relative border-l border-zinc-800 hover:border-zinc-600 pl-10 py-6 transition-colors">
                          <div className="absolute left-0 top-10 w-4 h-[1px] bg-zinc-800 group-hover:bg-zinc-600 transition-colors"></div>
                          <div className="flex items-center gap-4 mb-4">
                             <h5 className="text-2xl font-bold text-zinc-100 tracking-tight">{page.title}</h5>
                             <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase border ${page.importance === 'high' ? 'bg-amber-900/20 text-amber-400 border-amber-900/50' : 'bg-zinc-900 text-zinc-600 border-zinc-800'}`}>
                                {page.importance}
                             </span>
                          </div>
                          <p className="text-zinc-400 mb-6 max-w-4xl text-base leading-relaxed font-medium">{page.description}</p>
                          {page.technical_breakdown && (
                            <div className="mb-6 bg-zinc-900/60 border border-zinc-800/50 p-6 rounded-xl">
                              <h6 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Technical Breakdown</h6>
                              <p className="text-zinc-300 text-sm leading-relaxed">{page.technical_breakdown}</p>
                            </div>
                          )}
                          {page.code_samples && page.code_samples.length > 0 && (
                            <div className="mb-6">
                              <h6 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Key Functional Mechanisms</h6>
                              <div className="space-y-3">
                                {page.code_samples.map((sample, i) => (
                                  <pre key={i} className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs overflow-x-auto text-emerald-400/90 shadow-lg">
                                    <code>{sample}</code>
                                  </pre>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isChatView && (
              <div className="space-y-12 pb-32">
                {chatHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-700 animate-in fade-in duration-1000">
                    <i className="fa-solid fa-terminal text-5xl mb-6 opacity-20"></i>
                    <p className="text-sm font-mono tracking-widest uppercase text-center">Awaiting interrogation parameters...</p>
                  </div>
                )}
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex gap-6 group animate-in slide-in-from-bottom-2 duration-300 ${msg.role === 'assistant' ? 'bg-zinc-900/20 -mx-6 px-6 py-10 rounded-3xl border border-zinc-800/50 shadow-inner' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black border transition-all ${msg.role === 'user' ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-zinc-100 border-white text-zinc-950 shadow-lg'}`}>
                      {msg.role === 'user' ? (mode === ToolMode.BACKLOG_STEVE ? 'RAW' : 'OBJ') : (mode === ToolMode.BACKLOG_STEVE ? 'STV' : 'PHS')}
                    </div>
                    <div className="flex-1 min-w-0 relative">
                      {msg.role === 'assistant' && (
                        <div className="absolute top-0 right-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleGenerateDiagram(msg.content)} title="Generate Diagram" className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-all text-zinc-500 flex items-center justify-center">
                            <i className="fa-solid fa-project-diagram text-[10px]"></i>
                          </button>
                          <button onClick={() => handleExportMessageMarkdown(msg.content, idx)} title="Export to Markdown" className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-all text-zinc-500 flex items-center justify-center">
                            <i className="fa-solid fa-file-export text-[10px]"></i>
                          </button>
                        </div>
                      )}
                      {msg.iteration && (
                        <div className="text-[9px] font-black text-emerald-500/60 uppercase tracking-[0.4em] mb-4 flex items-center gap-3">
                           PHASE_0{msg.iteration}::{deepResearchPhases[msg.iteration - 1]}
                           <span className="h-[1px] bg-emerald-900/30 flex-1"></span>
                        </div>
                      )}
                      <Markdown content={msg.content} className={msg.role === 'user' ? 'text-zinc-100 text-lg font-bold' : 'text-zinc-300 text-base leading-relaxed'} />
                    </div>
                  </div>
                ))}
                
                {mode === ToolMode.DEEP_RESEARCH && !isResearching && chatHistory.length > 1 && (
                   <div className="flex justify-center mt-12 animate-in fade-in zoom-in duration-500">
                     <button 
                       onClick={handleExportFullResearch}
                       className="group bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 transition-all active:scale-95"
                     >
                       <i className="fa-solid fa-file-arrow-down text-sm group-hover:bounce"></i>
                       Download Full Research Report
                     </button>
                   </div>
                )}

                {mode === ToolMode.BACKLOG_STEVE && !loading && chatHistory.length > 1 && chatHistory.some(m => m.content.includes('Backlog')) && (
                   <div className="flex justify-center mt-12 animate-in fade-in zoom-in duration-500">
                     <button 
                       onClick={handleExportSanitizedBacklog}
                       className="group bg-slate-600 hover:bg-slate-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-3 transition-all active:scale-95"
                     >
                       <i className="fa-solid fa-clipboard-list text-sm"></i>
                       Export Sanitized Backlog
                     </button>
                   </div>
                )}

                {(loading || isResearching) && (
                  <div className="flex gap-6 animate-pulse bg-zinc-900/20 -mx-6 px-6 py-10 rounded-3xl border border-zinc-800/50 shadow-inner">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce"></div>
                    </div>
                    <div className="flex-1 space-y-4 py-1">
                      <div className="h-2 bg-zinc-800 rounded w-3/4"></div>
                      <div className="h-2 bg-zinc-800 rounded w-1/2"></div>
                      <div className="h-2 bg-zinc-800 rounded w-5/6"></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isChatView && (
          <div className="bg-zinc-950 border-t border-zinc-800 px-8 py-6 z-20">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className={`bg-zinc-900 border border-zinc-800 p-2 rounded-[1.5rem] shadow-2xl flex gap-3 items-end ring-1 ring-zinc-800 transition-all ${isResearching ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                <button onClick={toggleRecording} className={`p-3.5 rounded-xl transition-all flex items-center justify-center flex-shrink-0 ${isRecording ? 'bg-red-900/30 text-red-400 ring-1 ring-red-900/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'hover:bg-zinc-800 text-zinc-500'}`}>
                  <i className={`fa-solid ${isRecording ? 'fa-stop' : 'fa-microphone'} text-sm`}></i>
                </button>
                <textarea 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                  placeholder={
                    mode === ToolMode.DEEP_RESEARCH ? "Define research objective..." : 
                    mode === ToolMode.BACKLOG_STEVE ? "Drop notes or snippets for Steve to grill..." :
                    "Structural interrogation..."
                  }
                  disabled={isResearching}
                  className="flex-1 bg-transparent border-none focus:ring-0 p-3.5 text-sm text-zinc-100 min-h-[52px] max-h-48 resize-none scrollbar-hide font-medium" rows={1} 
                />
                <button 
                  onClick={handleChat} 
                  disabled={loading || !input.trim() || isResearching}
                  className={`h-12 w-12 rounded-xl font-black transition-all disabled:opacity-10 flex items-center justify-center shadow-lg active:scale-95 flex-shrink-0 ${mode === ToolMode.BACKLOG_STEVE ? 'bg-slate-200 text-slate-950 hover:bg-white' : 'bg-zinc-100 text-zinc-950 hover:bg-white'}`}
                >
                  {(loading || isResearching) ? <i className="fa-solid fa-spinner fa-spin text-xs"></i> : <i className="fa-solid fa-chevron-up"></i>}
                </button>
              </div>
              <div className="flex justify-between items-center px-4">
                <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em]">Context: {repo.repoName} • {filteredRepo.files.length} active Files</p>
                {mode === ToolMode.DEEP_RESEARCH && (
                  <div className="flex items-center gap-3">
                     <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{isResearching ? `Stage: ${deepResearchPhases[researchIteration-1]}` : 'Synthesis Complete'}</span>
                     <div className="flex gap-1.5">
                        {[1,2,3,4].map(s => (
                          <div 
                            key={s} 
                            className={`w-3 h-1 rounded-full transition-all duration-500 ${researchIteration >= s ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}`}
                          ></div>
                        ))}
                     </div>
                  </div>
                )}
                {mode === ToolMode.BACKLOG_STEVE && (
                  <div className="flex items-center gap-2">
                     <i className="fa-solid fa-circle-nodes text-slate-600 text-[8px] animate-pulse"></i>
                     <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Steve is active & unimpressed</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;