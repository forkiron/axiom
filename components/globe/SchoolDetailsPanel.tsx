'use client';

import { motion, AnimatePresence } from 'framer-motion';

export interface BcSchoolRecord {
  id: string;
  schoolName: string;
  city: string;
  rank: number;
  rating: number;
  latitude: number;
  longitude: number;
}

interface SchoolDetailsPanelProps {
  school: BcSchoolRecord | null;
  onClose: () => void;
  getRatingColor?: (rating: number) => string;
}

export function SchoolDetailsPanel({ school, onClose, getRatingColor }: SchoolDetailsPanelProps) {
  return (
    <AnimatePresence>
      {school && (
        <motion.div
          initial={{ opacity: 0, x: -50, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -50, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute left-4 top-24 z-20 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="pr-8">
            <h2 className="text-xl font-bold tracking-tight text-slate-100 mb-1">
              {school.schoolName}
            </h2>
            <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-6">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {school.city}, British Columbia
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex flex-col justify-center items-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Overall Rating
                </div>
                <div 
                  className="text-4xl font-extrabold"
                  style={{ color: getRatingColor ? getRatingColor(school.rating) : '#10b981' }}
                >
                  {school.rating.toFixed(1)}
                  <span className="text-lg text-slate-500 font-medium ml-1">/10</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex flex-col justify-center items-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Provincial Rank
                </div>
                <div className="text-4xl font-extrabold text-white">
                  #{school.rank}
                </div>
              </div>
            </div>
            
            <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 flex gap-3 text-sm text-emerald-100">
              <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                To evaluate this school's curriculum difficulty directly, run one of their recent exams through the 
                <span className="font-semibold text-emerald-400"> AI Test Analyzer</span>.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
