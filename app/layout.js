import './globals.css'

export const metadata = {
  title: 'Anchor',
  description: "We don't write your story. We help you stay true to it.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <div className="anchor-build-marker no-print">Editor 0.3.3 Clean</div>
      </body>
    </html>
  )
}
