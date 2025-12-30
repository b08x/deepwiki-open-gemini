
import { RepoFile, RepoContext } from "../types";

export class GitHubService {
  private static readonly IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor', 'out', '.next'];
  private static readonly ALLOWED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.go', '.rs', '.cpp', '.h', '.css', '.html'];

  async fetchRepository(url: string): Promise<RepoContext> {
    const parts = this.parseGitHubUrl(url);
    if (!parts) throw new Error("Invalid GitHub URL format. Use: https://github.com/owner/repo");

    const { owner, repo } = parts;
    const files: RepoFile[] = [];
    
    await this.fetchRecursive(owner, repo, "", files);

    return {
      repoName: repo,
      repoUrl: url,
      repoType: "Detected GitHub Repository",
      files
    };
  }

  private parseGitHubUrl(url: string) {
    const regex = /github\.com\/([^/]+)\/([^/]+)/;
    const match = url.match(regex);
    if (match) {
      return { owner: match[1], repo: match[2].replace(".git", "") };
    }
    return null;
  }

  private async fetchRecursive(owner: string, repo: string, path: string, fileAccumulator: RepoFile[]) {
    // Limit to prevent hitting rate limits or crashing browser with massive repos
    if (fileAccumulator.length > 50) return;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
    if (!response.ok) {
      if (response.status === 403) throw new Error("GitHub API rate limit exceeded. Try again later.");
      throw new Error("Failed to fetch repository contents.");
    }

    const items = await response.json();
    const contents = Array.isArray(items) ? items : [items];

    for (const item of contents) {
      if (item.type === 'dir') {
        if (!GitHubService.IGNORE_DIRS.includes(item.name)) {
          await this.fetchRecursive(owner, repo, item.path, fileAccumulator);
        }
      } else if (item.type === 'file') {
        const ext = '.' + item.name.split('.').pop();
        if (GitHubService.ALLOWED_EXTS.includes(ext) || item.name === 'README.md') {
          const fileContent = await this.fetchFileContent(item.url);
          fileAccumulator.push({
            path: item.path,
            content: fileContent
          });
        }
      }
    }
  }

  private async fetchFileContent(url: string): Promise<string> {
    const response = await fetch(url);
    const data = await response.json();
    if (data.encoding === 'base64') {
      return atob(data.content.replace(/\s/g, ''));
    }
    return data.content || "";
  }
}
