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
        backgroundColor: "#000",
        animation: "pulse 2s infinite",
      }}
    />
  ),
});

interface DashboardProps {
  categorizedModels: Record<string, string[]>;
}

function CategorySlider({ category, models }: { category: string; models: string[] }) {
  const sliderRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const x = useMotionValue(0);
  const resumeTimer = React.useRef<NodeJS.Timeout | null>(null);

  const duplicatedModels = React.useMemo(() => [...models, ...models], [models]);

  const staggerContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.15 } }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  React.useEffect(() => {
    if (innerRef.current) {
      const singleSetWidth = innerRef.current.scrollWidth / 2;
      const speed = 30; // Slower speed for more elegant movement
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
    <div style={{ 
      marginBottom: "20px",
      backgroundColor: "#f5f0eb", // Light warm gray
      padding: "40px 0"
    }}>
      <h2
        style={{
          textAlign: "center",
          fontFamily: "var(--font-family)",
          margin: "40px 0",
          color: "#8b7355", // Warm brown
          fontSize: "2.5rem",
          fontWeight: "300",
          letterSpacing: "0.1em",
          textTransform: "uppercase"
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
                const speed = 30;
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
          style={{ 
            x,
            display: "flex",
            backgroundColor: "#f5f0eb" // Light warm gray
          }}
        >
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            style={{ 
              display: "flex", 
              gap: "30px", 
              padding: "20px" 
            }}
          >
            {duplicatedModels.map((model, index) => {
              const gifSrc = `/gifs/${category}/${model.replace(".glb", ".gif")}`;
              return (
                <Link key={index} href={`/${category}/${model.replace(".glb", "")}`}>
                  <motion.div
                    variants={cardVariants}
                    whileHover={{ 
                      scale: 1.05,
                      boxShadow: "0 8px 16px rgba(139,115,85,0.2)"
                    }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    style={{
                      cursor: "pointer",
                      border: "1px solid rgba(139,115,85,0.2)",
                      borderRadius: "15px",
                      padding: "15px",
                      background: "#ffffff",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 4px 12px rgba(139,115,85,0.1)",
                      minWidth: "250px",
                    }}
                  >
                    <img
                      src={gifSrc}
                      alt={model}
                      style={{ 
                        width: "100%", 
                        borderRadius: "10px",
                        aspectRatio: "1",
                        objectFit: "cover"
                      }}
                    />
                    <p style={{
                      textAlign: "center",
                      marginTop: "15px",
                      color: "#8b7355", // Warm brown
                      fontSize: "1.1rem",
                      fontWeight: "300",
                      letterSpacing: "0.05em"
                    }}>
                      {model.replace(".glb", "").split("-").join(" ")}
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

export default function Dashboard({ categorizedModels = {} }: DashboardProps) {
  // Preload the RingViewer component in the background
  useEffect(() => {
    import("./RingViewer");
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      style={{
        backgroundColor: "#FFF",
        minHeight: "100vh",
        // padding: "40px 20px",
        backgroundImage: "url('/images/diamond-bg.jpg')", // Add a dark, elegant background image
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: "40px",
        backgroundColor: "#ffffff",
        padding: "20px 0"
      }}>
        <Link href="https://masinadiamonds.com" passHref>
            <img 
              src="//masinadiamonds.com/cdn/shop/files/366327210_768017625324629_3600285306584146928_n_1.jpg?v=1697432446&width=380"
              alt="Masina Diamonds"
              style={{
                width: "200px",
                height: "auto",
                objectFit: "contain"
              }}
            />
        </Link>
      </div>

      <h1
        style={{
          textAlign: "center",
          fontFamily: "var(--font-family)",
          margin: "0",
          color: "#4a3f35", // Darker warm brown
          backgroundColor: "#dcd1c7",
          fontSize: "3.5rem",
          fontWeight: "300",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          padding: "40px 0"
        }}
      >
        Explore Our Collection
      </h1>

      {Object.entries(categorizedModels).map(([category, models]) => (
        <CategorySlider key={category} category={category} models={models} />
      ))}

      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        color: "#8b7355", // Warm brown
        borderTop: "1px solid rgba(139,115,85,0.2)",
        marginTop: "60px",
        backgroundColor: "#f5f0eb" // Light warm gray
      }}>
        <p style={{
          fontSize: "1.2rem",
          fontWeight: "300",
          letterSpacing: "0.05em",
          maxWidth: "800px",
          margin: "0 auto"
        }}>
          Each piece is crafted with exceptional attention to detail and the finest materials.
        </p>
      </div>
    </motion.div>
  );
} 