import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import BackboardQuestionBox from '../components/BackboardQuestionBox';

export const metadata: Metadata = {
  title: 'Academic Atlas Canada',
  description: '3D globe to Canada academic map experience',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#05070d] text-slate-100 antialiased">
        {children}
        <BackboardQuestionBox />
      </body>
    </html>
  );
}
