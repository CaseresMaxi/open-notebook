import type { MetadataRoute } from 'next'

// Installable web app. Browsers offer "Install" only over HTTPS (or localhost);
// on plain LAN HTTP, phones can still add a home-screen shortcut.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NextNootbook',
    short_name: 'NextNootbook',
    description: 'Study from your own sources: notebooks, chat, notes and practice exams.',
    start_url: '/notebooks',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0e0e0e',
    theme_color: '#0e0e0e',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
