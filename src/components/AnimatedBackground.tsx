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
      className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Subtle Dark Spatial Vignette & Radial Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.06),rgba(9,9,11,0))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.04),transparent_60%)]" />

      {/* Ultra-subtle Weightless Spatial Ambient Fields */}
      <motion.div
        animate={{
          x: [0, 25, 0],
          y: [0, -15, 0],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-[10%] left-[25%] h-[600px] w-[600px] rounded-full bg-cyan-900/10 blur-[140px] will-change-transform"
      />
      <motion.div
        animate={{
          x: [0, -20, 0],
          y: [0, 20, 0],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute bottom-[10%] right-[20%] h-[500px] w-[500px] rounded-full bg-blue-900/10 blur-[160px] will-change-transform"
      />

      {/* Spatial Dot Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}
