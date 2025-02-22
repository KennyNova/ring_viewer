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
    <div style={{
      backgroundColor: "#FFF",
      minHeight: "100vh",
      backgroundImage: "url('/images/diamond-bg.jpg')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
    }}>
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
      <h1 style={{
        textAlign: "center",
        fontFamily: "var(--font-family)",
        margin: "0",
        color: "#4a3f35",
        backgroundColor: "#dcd1c7",
        fontSize: "3.5rem",
        fontWeight: "300",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        padding: "40px 0",
      }}>
        Explore Our Collection
      </h1>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "30px",
        padding: "20px",
      }}>
        {availableCategories.map((category) => (
          <Link key={category} href={`/${category}`}>
            <HoverableDiv
              style={{
                backgroundColor: "#f5f0eb",
                padding: "20px 30px",
                borderRadius: "10px",
                boxShadow: "0 4px 12px rgba(139,115,85,0.1)",
                cursor: "pointer",
              }}
            >
              <p
                style={{
                  margin: "0",
                  textAlign: "center",
                  color: "#8b7355",
                  fontSize: "1.5rem",
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
