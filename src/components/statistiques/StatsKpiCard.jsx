import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

function useAnimatedNumber(target, duration = 800) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = typeof target === "number" ? target : 0;
    prevRef.current = to;
    if (from === to) return;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return display;
}

export default function StatsKpiCard({ icon: Icon, label, value, gradient, isMoney, delay = 0 }) {
  const animated = useAnimatedNumber(typeof value === "number" ? value : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-2xl font-black text-gray-900 leading-none">
        {isMoney ? animated.toLocaleString() : animated.toLocaleString()}
        {isMoney && <span className="text-xs ml-1 text-gray-500 font-medium">FCFA</span>}
      </p>
      <p className="text-xs text-gray-500 mt-1.5 font-medium leading-tight">{label}</p>
    </motion.div>
  );
}