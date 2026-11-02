import React from 'react';

export const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <img
    src="./icons/minarth.svg"
    alt=""
    aria-hidden="true"
    width={512}
    height={512}
    className={`shrink-0 ${className}`}
  />
);
