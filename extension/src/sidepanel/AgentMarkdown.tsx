import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export function AgentMarkdown({ content }: { content: string }) {
  const safeContent = content.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => <h1 className="mb-3 mt-1 text-lg font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold">{children}</h3>,
        p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>,
        pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-md bg-muted p-3">{children}</pre>,
      }}
    >
      {safeContent}
    </ReactMarkdown>
  );
}
