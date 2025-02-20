"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useAnimation, useMotionValue } from "framer-motion";

// The RingViewer is kept client-side (via dynamic import)
const RingViewer = dynamic(() => import("./RingViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "#FFFDD0", // Cream background
        animation: "pulse 2s infinite",
      }}
    />
  ),
});

interface DashboardProps {
  categorizedModels: Record<string, string[]>;
}

export default function Dashboard({ categorizedModels = {} }: DashboardProps) {
  // Preload the RingViewer component in the background
  useEffect(() => {
    import("./RingViewer");
  }, []);

  // NEW: CategorySlider Component for a horizontal slider per ring category
  function CategorySlider({ category, models }: { category: string, models: string[] }) {
    // References and animation controls
    const sliderRef = React.useRef<HTMLDivElement>(null);
    const innerRef = React.useRef<HTMLDivElement>(null);
    const controls = useAnimation();
    const x = useMotionValue(0);
    const resumeTimer = React.useRef<NodeJS.Timeout | null>(null);

    // Duplicate models for infinite looping
    const duplicatedModels = React.useMemo(() => [...models, ...models], [models]);

    // Stagger container for card entrance animation
    const staggerContainer = {
      hidden: {},
      visible: { transition: { staggerChildren: 0.15 } }
    };

    // Card entrance variants
    const cardVariants = {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    };

    // Start auto sliding on mount (after initial card animation)
    React.useEffect(() => {
      if (innerRef.current) {
        // Compute width of one set of cards
        const singleSetWidth = innerRef.current.scrollWidth / 2;
        const speed = 50; // pixels per second
        const duration = singleSetWidth / speed;
        controls.start({
          x: -singleSetWidth,
          transition: {
            ease: "linear",
            duration,
            repeat: Infinity,
          },
        });
      }
    }, [models, controls]);

    return (
      <div style={{ marginBottom: "40px" }}>
        <h2
          style={{
            textAlign: "center",
            fontFamily: "sans-serif",
            margin: "20px",
            color: "#8B5E3C",
          }}
        >
          {category}
        </h2>
        <div ref={sliderRef} style={{ overflow: "hidden", cursor: "grab" }}>
          <motion.div
            ref={innerRef}
            drag="x"
            dragElastic={0.2}
            dragMomentum={false}
            onDragStart={() => {
              controls.stop();
              if (resumeTimer.current) clearTimeout(resumeTimer.current);
            }}
            onDragEnd={() => {
              resumeTimer.current = setTimeout(() => {
                if (innerRef.current) {
                  const singleSetWidth = innerRef.current.scrollWidth / 2;
                  const speed = 50;
                  const currentXAbs = Math.abs(x.get());
                  const remain = singleSetWidth - currentXAbs > 0 ? singleSetWidth - currentXAbs : singleSetWidth;
                  controls.start({
                    x: -singleSetWidth,
                    transition: {
                      ease: "linear",
                      duration: remain / speed,
                      repeat: Infinity,
                    },
                  });
                }
              }, 5000);
            }}
            style={{ x, display: "flex", backgroundColor: "#FFFDD0" }}
          >
            {/* Wrap cards in a container for staggered entrance */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              style={{ display: "flex", gap: "20px", padding: "20px" }}
            >
              {duplicatedModels.map((model, index) => {
                const gifSrc = `/gifs/${category}/${model.replace(".glb", ".gif")}`;
                return (
                  <Link key={index} href={`/${category}/${model.replace(".glb", "")}`}>
                    <motion.div
                      variants={cardVariants}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      style={{
                        cursor: "pointer",
                        border: "1px solid #D4AF37",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "#FFF8E1",
                        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                        minWidth: "200px",
                      }}
                    >
                      <img
                        src={gifSrc}
                        alt={model}
                        style={{ width: "100%", borderRadius: "5px" }}
                      />
                      <p style={{ textAlign: "center", marginTop: "10px" }}>
                        {model.replace(".glb", "")}
                      </p>
                    </motion.div>
                  </Link>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ backgroundColor: "#FFFDD0", minHeight: "100vh", padding: "20px" }} // Cream page background
    >
      {/* Branding Header */}
      <h1
        style={{
          textAlign: "center",
          fontFamily: "sans-serif",
          margin: "20px",
          color: "#8B5E3C",
        }}
      >
        Masina Diamonds - Select Your Ring
      </h1>

      {Object.entries(categorizedModels).map(([category, models]) => (
        <CategorySlider key={category} category={category} models={models} />
      ))}
    </motion.div>
  );
} 