//
import Link from "next/link";
import Image from "next/image";
import { getCategories } from "@/lib/getModels";
import HoverableDiv from "@/components/HoverableDiv";
import RandomRingButton from '@/components/RandomRingButton';

// Preload HDR file so it's cached when the user selects a model
export const metadata = {
  links: [
    {
      rel: "preload",
      href: "/studio.hdr",
      as: "image",
    },
  ],
};

export default function Home() {
  const categorizedModels = getCategories();
  const availableCategories = Object.keys(categorizedModels);
  const categoryDescriptions: Record<string, string> = {
    Solitaire: "A timeless design that showcases a single center diamond with clean, elegant lines for maximum brilliance.",
    ThreeStone: "A trio of stones symbolizing past, present, and future, offering balanced sparkle and classic symmetry.",
    Unica: "Modern, design‑forward silhouettes with bold profiles and airy details—crafted as distinctive one‑of‑a‑kind pieces.",
    Vintage: "Heirloom‑inspired details—milgrain, filigree, and hand‑engraving—for an old‑world, romantic character."
  };

  return (
    <div className="page-container">
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: "40px",
        backgroundColor: "#ffffff",
        padding: "20px 0",
      }}>
        <Link href="https://masinadiamonds.com">
          <Image
            src="https://masinadiamonds.com/cdn/shop/files/366327210_768017625324629_3600285306584146928_n_1.jpg?v=1697432446&width=380"
            alt="Masina Diamonds"
            width={200}
            height={120}
            style={{ width: "200px", height: "auto", objectFit: "contain" }}
            priority
          />
        </Link>
      </div>
      <div className="title-container">
        <h1 className="title-text">
          Explore Our Collection
        </h1>
      </div>
      {/* Hero explainer */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        margin: "30px 0 10px",
        padding: "0 10px"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "1000px",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(139,115,85,0.15)",
          borderRadius: "16px",
          boxShadow: "0 8px 24px rgba(139,115,85,0.12)",
          overflow: "hidden"
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "24px"
          }}>
            <div className="md-gradient-chip" style={{
              display: "inline-flex",
              alignSelf: "flex-start"
            }}>Masina Diamonds 3D Ring Viewer</div>
            <p style={{
              margin: 0,
              color: "#4a3f35",
              fontSize: "1.1rem",
              lineHeight: 1.6
            }}>
              Explore a curated selection of custom rings we’ve crafted in the past. Spin, zoom, and swap metal finishes to see how each design comes to life — right in your browser.
            </p>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "6px"
            }}>
              <div className="md-gradient-chip">Real-time 3D</div>
              <div className="md-gradient-chip">Multiple metal options</div>
              <div className="md-gradient-chip">Mobile friendly</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "16px",
        padding: "10px",
        maxWidth: "1100px",
        margin: "0 auto"
      }}>
        {availableCategories.map((category) => (
          <Link key={category} href={`/${category}`}>
            <HoverableDiv className="md-glass-card md-glass-hover" style={{ cursor: "pointer", overflow: "hidden" }}>
              <div style={{ padding: "18px" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px"
                }}>
                  <h3 style={{
                    margin: 0,
                    color: "#4a3f35",
                    fontSize: "1.25rem",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 500
                  }}>{category}</h3>
                  <span className="md-gradient-chip" style={{ fontSize: "0.8rem" }}>{categorizedModels[category].length} rings</span>
                </div>
                <div style={{
                  background: "rgba(220, 209, 199, 0.4)",
                  border: "1px dashed rgba(139,115,85,0.35)",
                  borderRadius: "12px",
                  height: "140px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8b7355"
                }}>
                  Image placeholder
                </div>
                <p style={{
                  margin: "12px 0 0",
                  color: "#6b5a49",
                  lineHeight: 1.5,
                  fontSize: "0.95rem"
                }}>
                  {categoryDescriptions[category] || "Distinct silhouettes and settings from our custom archive."}
                </p>
              </div>
            </HoverableDiv>
          </Link>
        ))}
      </div>
      
      {/* Use the new RandomRingButton which forces a new random selection each time */}
      <RandomRingButton />
    </div>
  );
}
