import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'bağlık.society',
    short_name: 'bağlık',
    start_url: '/oda',
    display: 'standalone',
    background_color: '#0A0A0C',
    theme_color: '#0A0A0C',
    lang: 'tr',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
