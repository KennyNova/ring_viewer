import { readdirSync, statSync } from "fs";
import { join } from "path";
import Link from "next/link";
import HoverableDiv from "@/components/HoverableDiv";

export default function CategoryPage({ params }: { params: { category: string } }) {
  const { category } = params;
  let models: string[] = [];
  try {
    const categoryPath = join(process.cwd(), "public", "3d", category);
    if (statSync(categoryPath).isDirectory()) {
      models = readdirSync(categoryPath).filter((file) => file.endsWith(".glb"));
    }
  } catch (error) {
    console.error("Error reading models for category", category, error);
  }
  
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
        <h1 className="title-text" style={{ fontSize: "5vw", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {category}
        </h1>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "15px",
        width: "80vw",
        maxWidth: "1200px",
        padding: "10px",
        margin: "0 auto",
      }}>
        {models.map((model, index) => {
          const gifPath = `/gifs/${category}/${model.replace(".glb", ".gif")}`;
          const modelSlug = model.replace(".glb", "");
          
          // Function to check if file exists (this runs on server)
          const gifExists = (() => {
            try {
              const fullPath = join(process.cwd(), 'public', 'gifs', category, model.replace(".glb", ".gif"));
              return statSync(fullPath).isFile();
            } catch {
              return false;
            }
          })();

          const imageSrc = gifExists ? gifPath : "/ring-placeholder.gif";

          return (
            <Link key={index} href={`/${category}/${modelSlug}`}> 
              <HoverableDiv
                style={{
                  backgroundColor: "#f5f0eb",
                  padding: "20px 30px",
                  borderRadius: "10px",
                  boxShadow: "0 4px 12px rgba(139,115,85,0.1)",
                  cursor: "pointer",
                }}
              >
                <img 
                  src={imageSrc}
                  alt={model} 
                  style={{ 
                    width: "100%", 
                    height: "auto", 
                    objectFit: "cover", 
                    borderRadius: "10px",
                    aspectRatio: "1"
                  }} 
                />
                <p style={{
                  marginTop: "10px",
                  textAlign: "center",
                  color: "#8b7355",
                  fontSize: "1.5rem",
                  fontWeight: "300",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  {modelSlug.split("-").join(" ")}
                </p>
              </HoverableDiv>
            </Link>
          );
        })}
      </div>
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <Link href="/">
          <button style={{
            backgroundColor: "#D4AF37",
            color: "white",
            border: "none",
            borderRadius: "5px",
            padding: "10px 20px",
            cursor: "pointer",
          }}>
            Back to Categories
          </button>
        </Link>
      </div>
    </div>
  );
} 