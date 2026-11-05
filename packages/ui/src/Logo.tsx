import React from 'react';

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg' | number;
  showWordmark?: boolean;
  className?: string;
}

export function LogoMark({
  size = 28,
  className,
  style,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const gradientId = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#3B72FF" />
          <stop offset="100%" stopColor="#1842DF" />
        </linearGradient>
      </defs>
      {/* Brand Squircle Background */}
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      {/* Video Camera Body */}
      <rect x="5.5" y="8" width="13" height="16" rx="3.5" fill="#FFFFFF" />
      {/* Video Camera Lens */}
      <path
        d="M18.5 13.2L24.8 9.2C25.6 8.7 26.5 9.3 26.5 10.2V21.8C26.5 22.7 25.6 23.3 24.8 22.8L18.5 18.8V13.2Z"
        fill="#FFFFFF"
      />
      {/* Audio Wave Bars inside Camera Body */}
      <rect
        x="8.5"
        y="13"
        width="1.6"
        height="6"
        rx="0.8"
        fill={`url(#${gradientId})`}
      />
      <rect
        x="11.2"
        y="11"
        width="1.6"
        height="10"
        rx="0.8"
        fill={`url(#${gradientId})`}
      />
      <rect
        x="13.9"
        y="13.5"
        width="1.6"
        height="5"
        rx="0.8"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

export function Logo({
  size = 'md',
  showWordmark = true,
  className = '',
  style,
  ...props
}: LogoProps) {
  let pixelSize = 28;
  let fontSize = '22px';

  if (typeof size === 'number') {
    pixelSize = size;
    fontSize = `${Math.round(size * 0.78)}px`;
  } else if (size === 'sm') {
    pixelSize = 22;
    fontSize = '18px';
  } else if (size === 'lg') {
    pixelSize = 36;
    fontSize = '28px';
  }

  return (
    <span
      className={`brand ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
        fontSize,
        ...style,
      }}
      {...props}
    >
      <LogoMark size={pixelSize} />
      {showWordmark && <span className="brand-wordmark">MeetIT</span>}
    </span>
  );
}
