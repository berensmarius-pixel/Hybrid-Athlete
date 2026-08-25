"use client";

import React from "react";
import { motion } from "motion/react";

interface AnimatedGradientBackgroundProps {
  className?: string;
}

export default function AnimatedGradientBackground({
  className = "",
}: AnimatedGradientBackgroundProps) {
  return (
    <div
      className={`absolute inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-[20%] left-[20%] h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-blue-600/30 via-indigo-500/20 to-purple-600/30 blur-[100px]"
      />
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.2, 0.4, 0.2],
          x: [0, -40, 0],
          y: [0, 40, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute top-[30%] right-[15%] h-[450px] w-[450px] rounded-full bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-blue-600/30 blur-[120px]"
      />
    </div>
  );
}
