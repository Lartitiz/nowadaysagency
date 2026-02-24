import { cn } from "@/lib/utils";
import React from "react";

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  if (!content) return null;

  const sections = content.split(/\n---\n|\n---|\n-{3,}\n/).filter(Boolean);

  return (
    <div className={cn("space-y-3", className)}>
      {sections.map((section, sIdx) => {
        const lines = section.split("\n").filter(l => l.trim() !== "");

        return (
          <div key={sIdx}>
            {sIdx > 0 && <hr className="border-border my-3" />}
            {lines.map((line, lIdx) => {
              const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
              if (numberedMatch) {
                return (
                  <div key={lIdx} className="flex gap-2 mb-1.5">
                    <span className="text-muted-foreground font-medium shrink-0">{numberedMatch[1]}.</span>
                    <span>{renderInline(numberedMatch[2])}</span>
                  </div>
                );
              }

              const bulletMatch = line.match(/^[-•]\s+(.+)/);
              if (bulletMatch) {
                return (
                  <div key={lIdx} className="flex gap-2 mb-1.5">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <span>{renderInline(bulletMatch[1])}</span>
                  </div>
                );
              }

              return (
                <p key={lIdx} className="mb-2 last:mb-0">
                  {renderInline(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}
