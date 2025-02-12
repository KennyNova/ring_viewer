import { readdirSync } from "fs";
import { join } from "path";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  let models: string[] = [];
  try {
    const modelsDir = join(process.cwd(), 'public', '3d');
    models = readdirSync(modelsDir).filter((file) => file.endsWith('.glb'));
  } catch (error) {
    console.error("Error reading models directory", error);
  }

  return (
    <div className="min-h-screen">
      <Dashboard models={models} />
    </div>
  );
}
