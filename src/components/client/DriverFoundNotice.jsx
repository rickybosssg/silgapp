import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
export default function DriverFoundNotice({ name }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }} className="bg-white rounded-3xl p-8 flex flex-col items-center shadow-2xl max-w-full">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl"><CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} /></div>
      <p className="text-lg font-black text-gray-900 mt-4">Livreur trouvé !</p><p className="text-sm text-gray-500 mt-1 break-words text-center">{name || 'Votre livreur'} arrive</p>
    </motion.div>
  </motion.div>;
}
