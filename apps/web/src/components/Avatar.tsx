import React from 'react';

interface AvatarProps {
  name: string;
  src?: string | undefined;
  className?: string;
  style?: React.CSSProperties;
}

/** Circular avatar: shows the uploaded image, falling back to the name initial. */
export function Avatar({ name, src, className = 'av', style }: AvatarProps) {
  const initial = (name.trim()[0] || 'U').toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${className} av-img`}
        style={style}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className={className} style={style} aria-hidden="true">
      {initial}
    </div>
  );
}
