import { Octokit } from '@octokit/rest';
import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class GitHubClient {
  private octokit: Octokit;
  private repoOwner: string | undefined;
  private repoName: string | undefined;

  constructor(token?: string) {
    const cfg = vscode.workspace.getConfiguration('codeCompanion');
    const apiToken = token || cfg.get<string>('githubToken') || process.env.GITHUB_TOKEN || '';
    if (!apiToken) {
      vscode.window.showWarningMessage('CodeCompanion: GitHub token not configured – PR commenting disabled.');
    }
    this.octokit = new Octokit({ auth: apiToken || undefined });

    // Try to infer repo from git remote
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        encoding: 'utf8'
      }).trim();
      const match = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/.exec(remoteUrl);
      if (match) {
        this.repoOwner = match[1];
        this.repoName = match[2];
      }
    } catch {
      /* ignore */
    }
  }

  isConfigured() {
    return !!(this.repoOwner && this.repoName);
  }

  /**
   * Post a summary comment on a pull request.
   */
  async postComment(prNumber: number, body: string) {
    if (!this.isConfigured()) return;
    await this.octokit.issues.createComment({
      owner: this.repoOwner!,
      repo: this.repoName!,
      issue_number: prNumber,
      body
    });
  }
}

/**
 * Get git diff (HEAD vs target) as unified diff string.
 */
export function getGitDiff(target: string = 'origin/main'): string {
  try {
    return execSync(`git diff ${target}`, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/**
 * Very naive diff parser that counts additions / deletions per file.
 */
export function summarizeDiff(diff: string): string {
  const summary: Record<string, { add: number; del: number }> = {};
  const lines = diff.split('\n');
  let currentFile: string | undefined;
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const parts = line.split(' b/');
      currentFile = parts[1] || undefined;
      if (currentFile) summary[currentFile] = { add: 0, del: 0 };
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
          const key = currentFile as string;
          const stats = (summary[key] = summary[key] || { add: 0, del: 0 });
          stats.add += 1;
       } else if (line.startsWith('-') && !line.startsWith('---')) {
          const key = currentFile as string;
          const stats = (summary[key] = summary[key] || { add: 0, del: 0 });
          stats.del += 1;
       }
    }
  }
  const reportLines = Object.entries(summary).map(([file, { add, del }]) => `• ${file}: +${add} / -${del}`);
  return reportLines.join('\n');
} 