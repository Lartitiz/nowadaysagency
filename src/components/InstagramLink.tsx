import { type ReactNode } from "react";

interface InstagramLinkProps {
  username: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

function cleanPseudo(input: string): string {
  return input
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\/$/, '')
    .trim();
}

export default function InstagramLink({ username, children, className, onClick }: InstagramLinkProps) {
  const clean = cleanPseudo(username);
  const url = clean.startsWith('http')
    ? clean
    : `https://www.instagram.com/${clean}/`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
