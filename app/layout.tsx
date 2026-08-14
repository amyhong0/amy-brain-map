import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: 'Amy Brain Map',
  description: '웹 탐색의 흔적을 연결해 나만의 사고 지도를 만드는 개인 브레인 맵',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  )
}
