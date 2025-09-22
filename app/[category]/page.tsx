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
      {/* Category explainer */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        margin: "20px 0 10px",
        padding: "0 10px"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "1000px",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(139,115,85,0.15)",
          borderRadius: "16px",
          boxShadow: "0 8px 24px rgba(139,115,85,0.12)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "20px 20px" }}>
            <div className="md-gradient-chip" style={{ display: "inline-flex" }}>Curated designs</div>
            <p style={{
              margin: "10px 0 0",
              color: "#4a3f35",
              lineHeight: 1.6
            }}>
              Browse {category} rings we’ve crafted in the past. Click any design to view it in 3D and experiment with metal options.
            </p>
          </div>
        </div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "18px",
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
              <HoverableDiv className="md-glass-card md-glass-hover" style={{ cursor: "pointer", padding: "16px", borderRadius: "12px" }}>
                <div style={{
                  background: "rgba(220, 209, 199, 0.4)",
                  border: "1px dashed rgba(139,115,85,0.35)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}>
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
                </div>
                <p style={{
                  marginTop: "10px",
                  textAlign: "center",
                  color: "#6b5a49",
                  fontSize: "1.05rem",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
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
          <button className="md-gradient-btn" style={{ padding: "12px 22px" }}>
            Back to Categories
          </button>
        </Link>
      </div>
    </div>
  );
} 