
import React from 'react';

interface MarkdownProps {
  content: string;
  className?: string;
}

const Markdown: React.FC<MarkdownProps> = ({ content, className = "" }) => {
  // Very basic markdown parser for demonstration
  // In a real app, use react-markdown
  const parseMarkdown = (text: string) => {
    let html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3 border-b border-zinc-800 pb-1">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-zinc-700 pl-4 italic my-4">$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' class='text-blue-400 hover:underline'>$1</a>")
      .replace(/\n$/gim, '<br />');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-zinc-900 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm border border-zinc-800"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-sm">$1</code>');
    
    // List items
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
    html = html.replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

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
