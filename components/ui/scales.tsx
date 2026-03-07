'use client';

interface ScalesProps {
  size?: number;
  className?: string;
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Scales({ size = 8, className }: ScalesProps) {
  const tile = Math.max(4, size);

  return (
    <div
      className={joinClassNames('h-full w-full', className)}
      style={{
        backgroundColor: 'rgba(12, 12, 12, 0.62)',
        backgroundSize: `${tile * 2}px ${tile}px`,
        backgroundPosition: '0 0, 0 0, 0 0',
        backgroundImage: `
          radial-gradient(circle at ${tile}px ${tile}px, rgba(226, 233, 244, 0.36) 0.9px, rgba(0, 0, 0, 0) 1.2px),
          radial-gradient(circle at 0 ${tile}px, rgba(226, 233, 244, 0.36) 0.9px, rgba(0, 0, 0, 0) 1.2px),
          linear-gradient(to bottom, rgba(184, 198, 220, 0.26) 1px, rgba(0, 0, 0, 0) 1px)
        `,
      }}
    />
  );
}
