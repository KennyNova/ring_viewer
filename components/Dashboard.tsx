"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// The RingViewer is kept client-side (via dynamic import)
const RingViewer = dynamic(() => import("./RingViewer"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 w-full h-full min-h-screen bg-gray-100 animate-pulse" />
  ),
});

interface DashboardProps {
  models: string[];
}

export default function Dashboard({ models }: DashboardProps) {
  return (
    <div>
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

      {/* Dashboard Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
          padding: "20px",
          backgroundColor: "#FFFDD0", // Cream background
        }}
      >
        {models.map((model) => {
          // Assumes each model file name maps to a gif of the same base name.
          const gifSrc = `/gifs/${model.replace(".glb", ".gif")}`;
          return (
            <Link key={model} href={`/${model.replace(".glb", "")}`}>
              <div
                style={{
                  cursor: "pointer",
                  border: "1px solid #D4AF37", // Gold border
                  borderRadius: "10px",
                  padding: "10px",
                  background: "#FFF8E1", // Lighter cream
                  boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.transform =
                    "scale(1.05)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.transform = "scale(1)")
                }
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
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
} 