import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThinkingProcess } from '@/components/ui/reasoning-toggle';
import { ChatMessageWithReasoning } from '@/lib/types/models';
import 'highlight.js/styles/github-dark.css';

interface MarkdownMessageProps {
  content: string;
  className?: string;
  reasoning?: {
    thinking: string;
    final: string;
    enabled: boolean;
  };
  showCopyButton?: boolean;
  copyButtonVariant?: 'icon' | 'icon-text';
}

export function MarkdownMessage({ 
  content, 
  className = '', 
  reasoning,
  showCopyButton = true,
  copyButtonVariant = 'icon-text' 
}: MarkdownMessageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(true);
  const isIconOnlyCopyButton = copyButtonVariant === 'icon';

  const copyToClipboard = async (text: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(codeId);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', JSON.stringify(err, null, 2));
    }
  };

  // Если есть reasoning, разделяем контент
  const displayContent = reasoning && reasoning.enabled ? reasoning.final : content;
  const thinkingContent = reasoning && reasoning.enabled ? reasoning.thinking : null;

  return (
    <div className={`markdown-message ${className}`}>
      {/* Отображаем процесс мышления если есть */}
      {thinkingContent && reasoning && reasoning.enabled && (
        <div className="mb-4">
          <ThinkingProcess
            thinking={thinkingContent}
            style="expanded"
            className="mb-4"
          />
        </div>
      )}

      {/* Основной контент */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
            const isInline = !className;

            if (!isInline && language) {
              return (
                <div className="relative group">
                  <div className="flex items-center justify-between bg-gray-800 text-gray-200 px-4 py-2 text-sm font-mono rounded-t-md">
                    <span>{language}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(String(children).replace(/\n$/, ''), codeId)}
                    >
                      {copiedCode === codeId ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <pre className="!mt-0 !rounded-t-none bg-gray-900 p-4 overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }

            return (
              <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <div className="my-4">{children}</div>;
          },
          h1({ children }) {
            return <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xl font-semibold mt-5 mb-3">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>;
          },
          p({ children }) {
            return <p className="mb-4 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic text-gray-700 dark:text-gray-300">
                {children}
              </blockquote>
            );
          },
          a({ children, href }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                {children}
              </td>
            );
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>

      {/* Кнопка копирования всего сообщения */}
      {showCopyButton && (
        <div className="flex justify-end mt-4">
          <Button
            variant="ghost"
            size="sm"
            className={isIconOnlyCopyButton ? 'h-8 w-8 p-0' : 'text-xs'}
            onClick={() => copyToClipboard(displayContent, 'full-message')}
            aria-label={copiedCode === 'full-message' ? 'Скопировано' : 'Копировать'}
            title={copiedCode === 'full-message' ? 'Скопировано' : 'Копировать'}
          >
            {copiedCode === 'full-message' ? (
              <>
                <Check className={isIconOnlyCopyButton ? 'h-4 w-4' : 'h-3 w-3 mr-1'} />
                {!isIconOnlyCopyButton && 'Скопировано'}
              </>
            ) : (
              <>
                <Copy className={isIconOnlyCopyButton ? 'h-4 w-4' : 'h-3 w-3 mr-1'} />
                {!isIconOnlyCopyButton && 'Копировать'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Компонент для отображения сообщения с reasoning
export function ChatMessageWithReasoningDisplay({ 
  message 
}: { 
  message: ChatMessageWithReasoning;
}) {
  const [showThinking, setShowThinking] = useState(true);

  return (
    <div className="space-y-4">
      {/* Процесс мышления */}
      {message.reasoning && message.reasoning.enabled && message.reasoning.thinking && (
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Процесс мышления
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>

          {showThinking && (
            <ThinkingProcess
              thinking={message.reasoning.thinking}
              style="expanded"
            />
          )}
        </div>
      )}

      {/* Основной контент сообщения */}
      <MarkdownMessage
        content={message.reasoning && message.reasoning.enabled ? message.reasoning.final : message.content}
        reasoning={message.reasoning}
        showCopyButton={false}
      />
    </div>
  );
}
