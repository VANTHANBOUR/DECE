import React, { useState, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  alt?: string;
  fallbackClass?: string;
}

const COLOR_GRADIENTS = [
  'bg-gradient-to-br from-emerald-600 to-teal-800 text-white',
  'bg-gradient-to-br from-blue-600 to-indigo-800 text-white',
  'bg-gradient-to-br from-purple-600 to-pink-800 text-white',
  'bg-gradient-to-br from-amber-600 to-orange-800 text-white',
  'bg-gradient-to-br from-rose-600 to-red-800 text-white',
  'bg-gradient-to-br from-teal-600 to-cyan-800 text-white',
  'bg-gradient-to-br from-violet-600 to-purple-900 text-white',
  'bg-gradient-to-br from-sky-600 to-blue-800 text-white',
];

export function getInitials(name?: string): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getGradientByName(name?: string): string {
  if (!name) return COLOR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_GRADIENTS.length;
  return COLOR_GRADIENTS[index];
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  className = 'w-10 h-10 rounded-xl',
  alt,
  fallbackClass
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const initials = getInitials(name);
  const gradient = getGradientByName(name);
  const isImageValid = Boolean(src && src.trim() && !hasError);

  if (isImageValid) {
    return (
      <img
        src={src!}
        alt={alt || name || 'User Avatar'}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className={`${className} object-cover shrink-0`}
      />
    );
  }

  // Fallback Initials / Icon Badge
  return (
    <div
      aria-label={alt || name || 'User Avatar'}
      title={name}
      className={`${className} ${fallbackClass || gradient} flex items-center justify-center font-black tracking-tight shrink-0 select-none shadow-2xs`}
      style={{ fontSize: 'calc(0.38 * 100%)' }}
    >
      {initials && initials !== '?' ? (
        <span className="text-xs sm:text-sm font-black tracking-wider uppercase drop-shadow-xs">
          {initials}
        </span>
      ) : (
        <UserIcon className="w-1/2 h-1/2 text-white/90" />
      )}
    </div>
  );
};
