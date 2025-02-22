"use client";

import React, { useState } from 'react';

interface HoverableDivProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function HoverableDiv({ children, style, ...props }: HoverableDivProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      {...props}
      style={{
        ...style,
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.2s',
      }}
      onMouseOver={(e) => {
        setHovered(true);
        if (props.onMouseOver) props.onMouseOver(e);
      }}
      onMouseOut={(e) => {
        setHovered(false);
        if (props.onMouseOut) props.onMouseOut(e);
      }}
    >
      {children}
    </div>
  );
} 