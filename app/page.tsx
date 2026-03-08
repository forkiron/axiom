'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
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

function FadeIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

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
    <main className={`relative isolate bg-[#080B10] text-zinc-100 ${displayFont.className}`}>

      {/* ───────────────────────────────────────────────────────
          SECTION 1 — HERO  (full-height, product UI behind text)
      ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Background atmosphere */}
        <div className="pointer-events-none absolute inset-0 z-0 axiom-atmosphere" />
        <div className="pointer-events-none absolute inset-0 z-0 axiom-stars opacity-20" />
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[1] select-none opacity-20 [background-size:42px_42px]',
            '[background-image:linear-gradient(to_right,#1a1a2e_1px,transparent_1px),linear-gradient(to_bottom,#1a1a2e_1px,transparent_1px)]'
          )}
        />
        <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
          <Spotlight className="-top-[34rem] left-1/2 h-[72rem] w-[72rem] -translate-x-1/2" fill="white" />
          <Spotlight className="top-[10%] -left-40 h-[50rem] w-[50rem]" fill="#3b82f6" />
          <Spotlight className="top-[5%] -right-44 h-[40rem] w-[40rem]" fill="#818cf8" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden opacity-80">
          <div className="absolute -inset-y-[18%] left-3 h-[136%] w-10 sm:left-5" style={verticalMask}>
            <Scales size={8} className="rounded-lg" />
          </div>
          <div className="absolute -inset-y-[18%] right-3 h-[136%] w-10 sm:right-5" style={verticalMask}>
            <Scales size={8} className="rounded-lg" />
          </div>
          <div className="absolute -inset-x-[12%] top-3 h-10 w-[124%] sm:top-5" style={horizontalMask}>
            <Scales size={8} className="rounded-lg" />
          </div>
          <div className="absolute -inset-x-[12%] bottom-3 h-10 w-[124%] sm:bottom-5" style={horizontalMask}>
            <Scales size={8} className="rounded-lg" />
          </div>
        </div>

        {/* Fake product UI — blurred behind the headline */}
        <div className="absolute inset-0 z-[4] flex items-center justify-end pr-0 pointer-events-none">
          <div className="relative w-[65%] h-full opacity-25 blur-[1px]" style={{
            background: 'linear-gradient(to left, rgba(8,11,16,0) 0%, transparent 100%)'
          }}>
            {/* Mock map/globe panel */}
            <div className="absolute top-1/2 right-[-5%] -translate-y-1/2 w-full aspect-[4/3] rounded-2xl border border-white/8 bg-[#0d1117] overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-slate-900/60 to-slate-950/80" />
              {/* Fake school list cards */}
              <div className="absolute top-6 right-6 w-56 space-y-2">
                {[
                  { name: 'Corpus Christi', city: 'Vancouver', rating: 10.0, adj: '+3.2%', pos: true },
                  { name: 'Crofton House', city: 'Vancouver', rating: 10.0, adj: '-1.8%', pos: false },
                  { name: 'Southridge', city: 'Surrey', rating: 9.9, adj: '+2.1%', pos: true },
                  { name: 'Collingwood', city: 'West Vancouver', rating: 9.8, adj: '+4.7%', pos: true },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg border border-white/6 bg-white/4 px-3 py-2">
                    <div>
                      <p className="text-[10px] font-medium text-white">{s.name}</p>
                      <p className="text-[9px] text-slate-500">{s.city}</p>
                    </div>
                    <span className={`text-[10px] font-semibold ${s.pos ? 'text-emerald-400' : 'text-rose-400'}`}>{s.adj}</span>
                  </div>
                ))}
              </div>
              {/* Fake dial / score */}
              <div className="absolute bottom-8 left-8 rounded-xl border border-white/8 bg-white/4 p-4 w-40">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Difficulty</p>
                <p className="text-3xl font-bold text-white">7.4<span className="text-sm text-slate-500 font-normal ml-1">/10</span></p>
                <p className="text-[9px] text-emerald-400 mt-1">↑ Grade Deflation</p>
              </div>
            </div>
          </div>
          {/* Gradient mask over the right side ui to fade into the text */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#080B10] via-[#080B10]/80 to-transparent" />
        </div>

        {/* Hero text — sits above the blurred UI */}
        <div className="relative z-[5] flex min-h-screen flex-col justify-center px-8 sm:px-16 lg:px-24 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          >
            <p className={`mb-6 text-[10px] tracking-[0.3em] text-zinc-500 ${monoFont.className}`}>AXIOM</p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight text-white">
              Grade smarter.{' '}
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                Score fairly.
              </span>
            </h1>
            <p className="mt-6 text-lg text-zinc-400 leading-relaxed max-w-lg">
              The world's first AI grading intelligence platform. Starting in Canada — built to go everywhere.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/globe"
                className={`rounded-md bg-white px-8 py-3.5 text-xs font-semibold tracking-[0.12em] text-black transition hover:bg-zinc-100 ${monoFont.className}`}
              >
                ENTER AXIOM
              </Link>
              <a
                href="#section-grade"
                className={`text-xs font-medium tracking-[0.1em] text-zinc-400 transition hover:text-white ${monoFont.className}`}
              >
                SEE HOW IT WORKS ↓
              </a>
            </div>
          </motion.div>
        </div>

        {/* Scroll arrow */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="absolute bottom-10 left-1/2 z-[5] -translate-x-1/2"
        >
          <svg className="h-5 w-5 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </section>

      {/* ───────────────────────────────────────────────────────
          SECTION 2 — "Find out what your grade really means"
      ─────────────────────────────────────────────────────── */}
      <section id="section-grade" className="relative min-h-screen flex items-center bg-[#07090E] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-15 [background-size:40px_40px] [background-image:linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)]" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-8 sm:px-16 py-32 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

          {/* Left — big editorial text */}
          <FadeIn className="flex-1 min-w-0">
            <p className={`mb-5 text-[10px] tracking-[0.3em] text-zinc-600 ${monoFont.className}`}>01 / INTELLIGENCE</p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-white">
              find out what<br />
              your grade{' '}
              <em className="not-italic text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">
                really means.
              </em>
            </h2>
            <p className="mt-6 text-base text-zinc-400 leading-relaxed max-w-md">
              A 90% at one school isn't the same as a 90% at another. Test difficulty, curriculum depth, time pressure,
              and question style all shape what a grade is actually worth — and right now, none of that is visible.
            </p>
            <p className="mt-4 text-base text-zinc-500 leading-relaxed max-w-md">
              AXIOM uses <span className="text-zinc-300 font-medium">Backboard.io AI</span> to read real exam PDFs,
              count questions, detect cognitive difficulty, and compare against provincial curriculum standards —
              automatically.
            </p>
          </FadeIn>

          {/* Right — mock analyzer result card */}
          <FadeIn delay={0.15} className="flex-1 min-w-0 w-full">
            <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-6 shadow-2xl max-w-sm mx-auto lg:mx-0 lg:ml-auto">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-base font-semibold text-white">Analysis Complete</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Backboard.io AI Evaluation</p>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                  Grade Deflation
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl border border-white/6 bg-white/3 p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Difficulty</p>
                  <p className="text-3xl font-bold text-white">7.4<span className="text-sm text-zinc-500 font-normal ml-1">/10</span></p>
                </div>
                <div className="rounded-xl border border-white/6 bg-white/3 p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Adjustment</p>
                  <p className="text-3xl font-bold text-emerald-400">+3.2<span className="text-sm text-zinc-500 font-normal ml-1">%</span></p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="text-xs text-zinc-500">Questions</span>
                <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-200">28</span>
                <span className="text-xs text-zinc-500">Style</span>
                <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-200">Critical Thinking</span>
              </div>
              <div className="rounded-xl border border-white/6 bg-white/3 p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Curriculum Alignment</p>
                <p className="text-xs text-zinc-300 leading-relaxed">This test covers 2 topics beyond standard BC Grade 12 curriculum, indicating above-average expectations.</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────
          SECTION 3 — "Standardizing grades everywhere"
      ─────────────────────────────────────────────────────── */}
      <section id="section-standard" className="relative min-h-screen flex items-center overflow-hidden bg-[#080B10]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-transparent to-emerald-950/10" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-8 sm:px-16 py-32 flex flex-col lg:flex-row-reverse items-center gap-16 lg:gap-24">

          {/* Right becomes left on large — editorial text */}
          <FadeIn className="flex-1 min-w-0">
            <p className={`mb-5 text-[10px] tracking-[0.3em] text-zinc-600 ${monoFont.className}`}>02 / STANDARDS</p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-white">
              standardizing grades{' '}
              <em className="not-italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                everywhere.
              </em>
            </h2>
            <p className="mt-6 text-base text-zinc-400 leading-relaxed max-w-md">
              We map schools across every province and territory. When a test is analyzed, its adjustment factor gets
              pinned to that school on the map — building a living, data-driven picture of grading standards nationwide.
            </p>
            <p className="mt-4 text-base text-zinc-500 leading-relaxed max-w-md">
              Canada first. Then the world.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-3 max-w-md">
              {[
                { icon: '🗺️', label: 'Live school map', sub: 'BC · AB · QC and beyond' },
                { icon: '📄', label: 'PDF upload', sub: 'No copy-paste required' },
                { icon: '🎓', label: 'Curriculum check', sub: 'Province-by-province' },
                { icon: '⚖️', label: 'Inflation detector', sub: 'Transparent & auditable' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="rounded-xl border border-white/7 bg-white/3 p-4 flex gap-3 items-start">
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <Link
                href="/globe"
                className={`inline-block rounded-md bg-white px-8 py-3.5 text-xs font-semibold tracking-[0.12em] text-black transition hover:bg-zinc-100 ${monoFont.className}`}
              >
                ENTER AXIOM →
              </Link>
            </div>
          </FadeIn>

          {/* Left becomes right — mock map panel */}
          <FadeIn delay={0.15} className="flex-1 min-w-0 w-full">
            <div className="rounded-2xl border border-white/8 bg-[#0d1117] overflow-hidden shadow-2xl max-w-sm mx-auto lg:mx-0">
              <div className="p-4 border-b border-white/6 flex items-center justify-between">
                <span className="text-sm font-medium text-white">School Map</span>
                <span className={`text-[10px] tracking-widest text-zinc-600 ${monoFont.className}`}>LIVE</span>
              </div>
              {/* Fake mini-map placeholder */}
              <div className="relative h-44 bg-gradient-to-br from-slate-900 to-[#0a0f1a] overflow-hidden">
                <div className="absolute inset-0 opacity-20 [background-size:24px_24px] [background-image:linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)]" />
                {/* Fake school dots */}
                {[
                  { x: '30%', y: '40%', c: 'bg-emerald-400', s: 'large' },
                  { x: '45%', y: '30%', c: 'bg-emerald-400', s: 'medium' },
                  { x: '55%', y: '55%', c: 'bg-rose-400', s: 'small' },
                  { x: '65%', y: '38%', c: 'bg-emerald-400', s: 'medium' },
                  { x: '38%', y: '62%', c: 'bg-amber-400', s: 'small' },
                  { x: '70%', y: '60%', c: 'bg-emerald-500', s: 'large' },
                ].map(({ x, y, c, s }, i) => (
                  <div
                    key={i}
                    className={`absolute rounded-full ${c} ${s === 'large' ? 'h-3 w-3' : s === 'medium' ? 'h-2 w-2' : 'h-1.5 w-1.5'} -translate-x-1/2 -translate-y-1/2 shadow-lg`}
                    style={{ left: x, top: y }}
                  />
                ))}
              </div>
              <div className="p-4 space-y-2">
                {[
                  { name: 'Corpus Christi', city: 'Vancouver, BC', adj: '+3.2%', pos: true },
                  { name: 'Southridge', city: 'Surrey, BC', adj: '+2.1%', pos: true },
                  { name: 'Eric Hamber', city: 'Vancouver, BC', adj: '-1.4%', pos: false },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-white/4 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">{s.name}</p>
                      <p className="text-[10px] text-zinc-600">{s.city}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${s.pos ? 'text-emerald-400' : 'text-rose-400'}`}>{s.adj}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${s.pos ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {s.pos ? 'Deflation' : 'Inflation'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <footer className="bg-[#080B10] px-8 py-6 text-center sm:px-16">
        <p className={`text-[10px] tracking-[0.2em] text-zinc-500 ${monoFont.className}`}>
          © {new Date().getFullYear()} AXIOM. ALL RIGHTS RESERVED.
        </p>
      </footer>

    </main>
  );
}
