"use client"

import dynamic from 'next/dynamic'

const RingViewer = dynamic(() => import('@/components/RingViewer'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 w-full h-full min-h-screen bg-gray-100 animate-pulse" />
})

export default function Home() {
  return (
    <div className="fixed inset-0 w-full h-full min-h-screen overflow-hidden">
      <RingViewer />
    </div>
  )
}
