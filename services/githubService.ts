
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

  async fetchRepository(url: string): Promise<RepoContext> {
    const parts = this.parseGitHubUrl(url);
    if (!parts) throw new Error("Invalid GitHub URL format. Use: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch");

    const { owner, repo, branch: providedBranch } = parts;
    let defaultBranch = providedBranch;

    // 1. Find the branch if not provided
    if (!defaultBranch) {
      const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: this.headers
      });
      
      if (!repoInfoResponse.ok) {
        if (repoInfoResponse.status === 403) {
          const isAuth = !!this.token;
          throw new Error(isAuth 
            ? "GitHub API rate limit exceeded even with token. Try again later." 
            : "GitHub API rate limit exceeded. Please add a GitHub Token in Settings to increase limits.");
        }
        throw new Error(`Failed to fetch repo info: ${repoInfoResponse.statusText}`);
      }
      const repoData = await repoInfoResponse.json();
      defaultBranch = repoData.default_branch || 'main';
    }

    // 2. Get Full Tree recursively
    const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, {
      headers: this.headers
    });
    
    if (!treeResponse.ok) {
      if (treeResponse.status === 403) throw new Error("GitHub API rate limit exceeded at tree discovery phase.");
      throw new Error("Failed to fetch repository file tree. Ensure the branch name is correct.");
    }
    const treeData = await treeResponse.json();

    const files: RepoFile[] = [];
    const entries = treeData.tree || [];

    const filteredEntries = entries.filter((item: any) => {
      if (item.type !== 'blob') return false;
      const pathParts = item.path.split('/');
      if (pathParts.some((p: string) => GitHubService.IGNORE_DIRS.includes(p) || p.startsWith('.'))) return false;
      const ext = '.' + item.path.split('.').pop();
      return GitHubService.ALLOWED_EXTS.includes(ext);
    }).slice(0, 100);

    // 3. Fetch contents using Raw CDN for efficiency, or API if private
    const fetchPromises = filteredEntries.map(async (item: any) => {
      try {
        // Try Raw CDN first (fast, 0 API cost)
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${item.path}`;
        const res = await fetch(rawUrl);
        if (res.ok) {
          const content = await res.text();
          if (content.length > 150000) return null; 
          return { path: item.path, content };
        }
        
        // Fallback to API for private repos if token exists
        if (this.token) {
          const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${defaultBranch}`, {
            headers: this.headers
          });
          if (apiRes.ok) {
            const data = await apiRes.json();
            const content = atob(data.content);
            return { path: item.path, content };
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch ${item.path}`, e);
      }
      return null;
    });

    const results = await Promise.all(fetchPromises);
    files.push(...results.filter((f): f is RepoFile => f !== null));

    if (files.length === 0) {
      throw new Error("No compatible code files found in the repository.");
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
    const regex = /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/;
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
