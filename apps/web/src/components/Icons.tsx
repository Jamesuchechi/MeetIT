import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export function VidIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M3 7h11v10H3zM14 11l7-4v10l-7-4" />
    </svg>
  );
}

export function MicIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function ScrIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M3 5h18v11H3zM8 20h8M12 16v4" />
    </svg>
  );
}

export function EndIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M3 14c5-5 13-5 18 0l-2.5 3-3.5-1.5V13c-2-.6-4-.6-6 0v2.5L5.5 17z" />
    </svg>
  );
}

export function HomeIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
    </svg>
  );
}

export function CalIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
    </svg>
  );
}

export function RecIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M4 5h16v14H4zM10 9l5 3-5 3z" />
    </svg>
  );
}

export function UsrIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5" />
    </svg>
  );
}

export function SetIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10M16 6v4M8 14v4" />
    </svg>
  );
}

export function PlusIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LnkIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

export function KbIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </svg>
  );
}

export function SunIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function MoonIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function CheckIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PanelRightIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </svg>
  );
}

export function InfoIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export function MenuIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function CloseIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function NotesIcon({ className = 'ic', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
