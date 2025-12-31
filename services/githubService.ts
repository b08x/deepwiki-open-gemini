
import { RepoFile, RepoContext } from "../types";

export class GitHubService {
  private static readonly IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor', 'out', '.next', '__pycache__', 'venv', 'target'];
  private static readonly ALLOWED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.go', '.rs', '.cpp', '.h', '.css', '.html', '.java', '.c', '.sh', '.yaml', '.yml'];
  private token: string | null = null;

  setToken(token: string) {
    this.token = token.trim() || null;
  }

  private get headers(): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }
    return headers;
  }

  /**
   * Decodes Base64 to UTF-8 correctly, handling multi-byte characters.
   */
  private decodeBase64(b64: string): string {
    const binString = atob(b64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  async fetchRepository(url: string): Promise<RepoContext> {
    const parts = this.parseGitHubUrl(url);
    if (!parts) throw new Error("Invalid GitHub URL format. Ensure it follows github.com/owner/repo");

    const { owner, repo, branch: providedBranch } = parts;
    let targetBranch = providedBranch;

    // 1. Resolve branch if not explicitly provided in URL
    if (!targetBranch) {
      const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: this.headers
      });
      
      if (!repoInfoResponse.ok) {
        if (repoInfoResponse.status === 403) {
          throw new Error("GitHub API rate limit exceeded. Please add a GitHub Token in Settings.");
        }
        if (repoInfoResponse.status === 404) {
          throw new Error("Repository not found. Is it private or a typo?");
        }
        throw new Error(`GitHub API Error: ${repoInfoResponse.statusText}`);
      }
      const repoData = await repoInfoResponse.json();
      targetBranch = repoData.default_branch || 'main';
    }

    // 2. Fetch the flat tree recursively
    const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, {
      headers: this.headers
    });
    
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch file tree. Branch '${targetBranch}' might not exist.`);
    }
    const treeData = await treeResponse.json();

    const entries = treeData.tree || [];
    const filteredEntries = entries.filter((item: any) => {
      if (item.type !== 'blob') return false;
      const pathParts = item.path.split('/');
      // Filter out hidden folders and ignored directories
      if (pathParts.some((p: string) => GitHubService.IGNORE_DIRS.includes(p) || p.startsWith('.'))) return false;
      
      const ext = '.' + item.path.split('.').pop();
      return GitHubService.ALLOWED_EXTS.includes(ext.toLowerCase());
    }).slice(0, 100); // Limit to top 100 files for context safety

    // 3. Fetch file contents
    const fetchPromises = filteredEntries.map(async (item: any) => {
      try {
        // Preference 1: GitHub API for consistent results and auth support
        const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${targetBranch}`, {
          headers: this.headers
        });
        
        if (apiRes.ok) {
          const data = await apiRes.json();
          // API usually returns Base64
          if (data.content && data.encoding === 'base64') {
            const content = this.decodeBase64(data.content.replace(/\n/g, ''));
            if (content.length > 200000) return null; // Skip overly large files
            return { path: item.path, content };
          }
        }

        // Preference 2: Fallback to Raw CDN (0 API cost, but 404 on private)
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${item.path}`;
        const res = await fetch(rawUrl);
        if (res.ok) {
          const content = await res.text();
          if (content.length > 200000) return null;
          return { path: item.path, content };
        }
      } catch (e) {
        console.warn(`Mechanism error fetching ${item.path}:`, e);
      }
      return null;
    });

    const results = await Promise.all(fetchPromises);
    const files = results.filter((f): f is RepoFile => f !== null);

    if (files.length === 0) {
      throw new Error("No readable code files discovered in the selected branch.");
    }

    return {
      repoName: repo,
      repoUrl: url,
      repoType: "GitHub Repository",
      files
    };
  }

  private parseGitHubUrl(url: string) {
    const cleanUrl = url.trim().replace(/\/$/, "");
    
    // Supports:
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/branch
    // https://github.com/owner/repo/blob/branch/path (takes the branch part)
    const regex = /github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+))?/;
    const match = cleanUrl.match(regex);
    
    if (match) {
      return { 
        owner: match[1], 
        repo: match[2].replace(".git", ""),
        branch: match[3] || null
      };
    }
    return null;
  }
}
