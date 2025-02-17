import { readdirSync, statSync } from "fs";
import { join } from "path";
import Dashboard from "@/components/Dashboard";

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

  return (
    <div className="min-h-screen">
      <Dashboard categorizedModels={categorizedModels} />
    </div>
  );
}
