import { readdirSync, statSync } from "fs";
import { join } from "path";
import Link from "next/link";
import HoverableDiv from "@/components/HoverableDiv";

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
  let categorizedModels: Record<string, string[]> = {};
  try {
    const baseDir = join(process.cwd(), "public", "3d");
    const categories = readdirSync(baseDir);
    categories.forEach((category) => {
      const categoryPath = join(baseDir, category);
      if (statSync(categoryPath).isDirectory()) {
        const files = readdirSync(categoryPath).filter((file) =>
          file.endsWith(".glb")
        );
        if (files.length > 0) {
          categorizedModels[category] = files;
        }
      }
    });
  } catch (error) {
    console.error("Error reading models directory", error);
  }
  const availableCategories = Object.keys(categorizedModels);

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
          <img
            src="//masinadiamonds.com/cdn/shop/files/366327210_768017625324629_3600285306584146928_n_1.jpg?v=1697432446&width=380"
            alt="Masina Diamonds"
            style={{ width: "200px", height: "auto", objectFit: "contain" }}
          />
        </Link>
      </div>
      <div className="title-container">
        <h1 className="title-text">
          Explore Our Collection
        </h1>
      </div>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "15px",
        padding: "10px",
      }}>
        {availableCategories.map((category) => (
          <Link key={category} href={`/${category}`}>
            <HoverableDiv
              style={{
                backgroundColor: "#f5f0eb",
                padding: "15px 20px",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(139,115,85,0.1)",
                cursor: "pointer",
              }}
            >
              <p
                style={{
                  margin: "0",
                  textAlign: "center",
                  color: "#8b7355",
                  fontSize: "clamp(1rem, 3vw, 1.5rem)",
                  fontWeight: "300",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {category}
              </p>
            </HoverableDiv>
          </Link>
        ))}
      </div>
    </div>
  );
}
