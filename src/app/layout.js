import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/toast'

export const metadata = {
  title: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
  description: "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
  applicationName: 'The Hair Cut',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-salons.vercel.app'),
  openGraph: {
    title: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
    description: "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
    images: ['/assets/Salon_Banner.jpeg'],
    type: 'website',
    url: '/',
    siteName: 'Salon POS System',
  },
  twitter: {
    card: 'summary',
    title: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
    description: "The Hair Cut is a modern men's salon in Birendranagar-7, Surkhet offering haircuts, shaving, hair color, hair spa, facials, and grooming packages.",
  },
  icons: {
    icon: [
      {
        url: '/assets/logo.jpg',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/assets/logo.jpg',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/assets/logo.jpg',
        type: 'image/jpeg',
      },
    ],
    apple: '/assets/logo.jpg',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const theme = localStorage.getItem('theme') || 'light';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                }
              } catch (error) {
                document.documentElement.classList.remove('dark');
              }
            })();
          `
        }} />
      </head>
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
