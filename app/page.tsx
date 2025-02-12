import dynamic from 'next/dynamic'
import { readdirSync } from "fs";
import { join } from "path";

const RingViewer = dynamic(() => import('@/components/RingViewer'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 w-full h-full min-h-screen bg-gray-100 animate-pulse" />
  )
})

export default function Home() {
  let models: string[] = [];
  try {
    const modelsDir = join(process.cwd(), 'public', '3d');
    models = readdirSync(modelsDir).filter(file => file.endsWith('.glb'));
  } catch (error) {
    console.error("Error reading models directory", error);
  }

  return (
    <div className="fixed inset-0 w-full h-full min-h-screen overflow-hidden">
      <RingViewer models={models} />
    </div>
  )
}
