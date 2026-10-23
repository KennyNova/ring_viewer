'use client';

import { useRouter } from 'next/navigation';

export default function RandomRingButton({ className = 'btn btn--outline' }: { className?: string }) {
  const router = useRouter();

  return (
    // Random query param forces a fresh server pick each time
    <button type="button" className={className} onClick={() => router.push(`/random-ring?rnd=${Date.now()}`)}>
      Surprise Me
    </button>
  );
}
