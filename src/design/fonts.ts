import localFont from 'next/font/local'

export const geistSans = localFont({
  src: '../fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap',
})
export const geistMono = localFont({
  src: '../fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  weight: '100 900',
  display: 'swap',
})
