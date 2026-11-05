import React from 'react';

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      className={`toast ${message ? 'on' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message ?? ''}
    </div>
  );
}
