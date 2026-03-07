'use client';

import { motion } from 'framer-motion';
import { GlobeScene } from '../components/globe/GlobeScene';
import { RouteTransitionOverlay } from '../components/transitions/RouteTransitionOverlay';
import { useRouteTransition } from '../lib/transitions';
import { useMapStore } from '../stores/useMapStore';

export default function LandingPage() {
  const { transitionTo } = useRouteTransition();
  const selectCountry = useMapStore((state) => state.selectCountry);

  const handleCanadaSelect = () => {
    transitionTo({
      path: '/canada',
      view: 'canada',
      countryCode: 'CA',
    });
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <RouteTransitionOverlay />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="h-full w-full"
      >
        <GlobeScene
          className="h-screen min-h-screen w-screen rounded-none border-0"
          onCountrySelect={selectCountry}
          onCanadaSelect={handleCanadaSelect}
        />
      </motion.div>
    </main>
  );
}
