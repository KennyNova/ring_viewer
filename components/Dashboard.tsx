"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

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

  // Variants for staggering cards
  const containerVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.15, // Delay of 0.15s between each card
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

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
        <div key={category}>
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
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "20px",
              padding: "20px",
              backgroundColor: "#FFFDD0", // Cream background for the grid container
            }}
          >
            {models.map((model) => {
              const gifSrc = `/gifs/${category}/${model.replace(".glb", ".gif")}`;
              return (
                <Link key={model} href={`/${category}/${model.replace(".glb", "")}`}>
                  <motion.div
                    variants={cardVariants}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    style={{
                      cursor: "pointer",
                      border: "1px solid #D4AF37", // Gold border
                      borderRadius: "10px",
                      padding: "10px",
                      background: "#FFF8E1", // Lighter cream
                      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <img
                      src={gifSrc}
                      alt={model}
                      style={{ width: "100%", borderRadius: "5px" }}
                    />
                    <p
                      style={{
                        textAlign: "center",
                        marginTop: "10px",
                      }}
                    >
                      {model.replace(".glb", "")}
                    </p>
                  </motion.div>
                </Link>
              );
            })}
          </motion.div>
        </div>
      ))}
    </motion.div>
  );
} 