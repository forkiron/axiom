'use client';

import { motion } from 'framer-motion';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Scales } from '@/components/ui/scales';
import { Spotlight } from '@/components/ui/spotlight';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export default function LandingPage() {
  const verticalMask = {
    maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
  } as const;

  const horizontalMask = {
    maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
    WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
  } as const;

  return (
    <main className={`relative isolate min-h-screen overflow-hidden text-zinc-100 ${displayFont.className}`}>
      <div className="pointer-events-none absolute inset-0 z-0 axiom-atmosphere" />
      <div className="pointer-events-none absolute inset-0 z-0 axiom-stars opacity-30" />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] select-none opacity-35 [background-size:42px_42px]',
          '[background-image:linear-gradient(to_right,#171717_1px,transparent_1px),linear-gradient(to_bottom,#171717_1px,transparent_1px)]'
        )}
      />
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
        <Spotlight className="-top-[34rem] left-1/2 h-[72rem] w-[72rem] -translate-x-1/2" fill="white" />
        <Spotlight className="top-[18%] -left-40 h-[40rem] w-[40rem]" fill="#93c5fd" />
        <Spotlight className="top-[8%] -right-44 h-[40rem] w-[40rem]" fill="#a5b4fc" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-95">
        <div
          className="absolute -inset-y-[18%] left-3 h-[136%] w-10 sm:left-5"
          style={verticalMask}
        >
          <Scales size={8} className="rounded-lg" />
        </div>
        <div
          className="absolute -inset-y-[18%] right-3 h-[136%] w-10 sm:right-5"
          style={verticalMask}
        >
          <Scales size={8} className="rounded-lg" />
        </div>
        <div
          className="absolute -inset-x-[12%] top-3 h-10 w-[124%] sm:top-5"
          style={horizontalMask}
        >
          <Scales size={8} className="rounded-lg" />
        </div>
        <div
          className="absolute -inset-x-[12%] bottom-3 h-10 w-[124%] sm:bottom-5"
          style={horizontalMask}
        >
          <Scales size={8} className="rounded-lg" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-[980px] flex-col items-center justify-center px-4 py-16 text-center sm:px-8"
      >
        <section className="w-full">
          <p className={`mb-4 text-xs tracking-[0.22em] text-zinc-400 ${monoFont.className}`}>AXIOM</p>
          <h1 className="text-balance text-4xl font-semibold leading-tight text-zinc-100 sm:text-5xl md:text-6xl">
            AI agents for standardization
          </h1>
          <div className="mt-10 flex items-center justify-center">
            <Link
              href="/globe"
              className={`rounded-md border border-white/15 bg-white px-7 py-3 text-xs font-medium tracking-[0.12em] text-black transition hover:bg-zinc-100 ${monoFont.className}`}
            >
              ENTER AXIOM
            </Link>
          </div>
        </section>
      </motion.div>
    </main>
  );
}
