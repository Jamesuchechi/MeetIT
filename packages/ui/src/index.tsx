import type { ButtonHTMLAttributes } from 'react';

export const tokens = {
  color: {
    brand: '#2563eb',
    brandHover: '#1d4ed8',
    canvas: '#111827',
    surface: '#1f2937',
    text: '#f9fafb',
    muted: '#9ca3af',
    danger: '#dc2626',
    success: '#16a34a',
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
    8: '2rem',
  },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', full: '9999px' },
  motion: { fast: '120ms', normal: '200ms', slow: '300ms' },
} as const;

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        background: tokens.color.brand,
        border: 0,
        borderRadius: tokens.radius.md,
        color: tokens.color.text,
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 600,
        padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
        ...props.style,
      }}
    />
  );
}
