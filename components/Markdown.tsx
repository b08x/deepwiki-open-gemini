
import React from 'react';

interface MarkdownProps {
  content: string;
  className?: string;
}

const Markdown: React.FC<MarkdownProps> = ({ content, className = "" }) => {
  const parseMarkdown = (text: string) => {
    let html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3 border-b border-zinc-800 pb-1">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-zinc-700 pl-4 italic my-4">$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' class='text-blue-400 hover:underline'>$1</a>");

    // Tables
    const tableRegex = /\|(.+)\|[\s\S]+?\|([\s\-\|]+)\|([\s\S]+?)(?=\n\n|\n$|$)/g;
    html = html.replace(tableRegex, (match, header, divider, rows) => {
      const headers = header.split('|').filter((h: string) => h.trim()).map((h: string) => `<th class="px-4 py-2 border border-zinc-800 bg-zinc-900 text-left font-bold text-xs uppercase tracking-wider">${h.trim()}</th>`).join('');
      const bodyRows = rows.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter((c: string) => c.trim() || row.includes('|')).map((c: string) => `<td class="px-4 py-2 border border-zinc-800 text-sm">${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse border border-zinc-800">${headers ? `<thead><tr>${headers}</tr></thead>` : ''}<tbody>${bodyRows}</tbody></table></div>`;
    });

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-zinc-900 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm border border-zinc-800"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-sm">$1</code>');
    
    // List items
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
    html = html.replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

    // Paragraphs / Line breaks
    html = html.replace(/\n$/gim, '<br />');

    return html.trim();
  };

  return (
    <div 
      className={`markdown-body leading-relaxed space-y-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
};

export default Markdown;
