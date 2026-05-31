import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/toast'

export const metadata = {
  title: 'Salon POS System',
  description: 'Fast salon management point of sale system with offline-friendly workflows',
  applicationName: 'Salon POS System',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-salons.vercel.app'),
  openGraph: {
    title: 'Salon POS System',
    description: 'Professional salon billing, staff performance, inventory, customer management, and reports.',
    type: 'website',
    url: '/',
    siteName: 'Salon POS System',
  },
  twitter: {
    card: 'summary',
    title: 'Salon POS System',
    description: 'Professional salon billing, staff performance, inventory, customer management, and reports.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const theme = localStorage.getItem('theme') || 'light';
              if (theme === 'dark') {
                document.documentElement.classList.add('dark');
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
