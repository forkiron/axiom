'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SpotlightProps {
  className?: string;
  fill?: string;
}

export function Spotlight({ className, fill = 'white' }: SpotlightProps) {
  return (
    <motion.div
      initial={{ opacity: 0.18, x: -26 }}
      animate={{ opacity: [0.16, 0.26, 0.16], x: [-26, 22, -26] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      className={cn('pointer-events-none absolute rounded-full blur-3xl', className)}
      style={{
        background: `radial-gradient(circle at center, ${fill} 0%, rgba(255, 255, 255, 0.16) 26%, rgba(255, 255, 255, 0.05) 46%, rgba(255, 255, 255, 0) 70%)`,
        mixBlendMode: 'screen',
      }}
    />
  );
}
