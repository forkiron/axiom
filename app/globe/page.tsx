'use client';

import { WorldGlobeMap } from '../../components/globe/WorldGlobeMap';

export default function GlobePage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <WorldGlobeMap className="h-screen min-h-screen w-screen" />
    </main>
  );
}
