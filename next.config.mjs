// One backend: never redirect application requests to a browser-only service.
if (process.env.NEXT_PUBLIC_DESIGN_PREVIEW === 'true' || process.env.API_ORIGIN) {
  throw Error('Este proyecto utiliza el backend MySQL. Retira NEXT_PUBLIC_DESIGN_PREVIEW y API_ORIGIN.');
}
for (const key of Object.keys(process.env)) {
  if (key.startsWith('NEXT_PUBLIC_') && /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE|DB_URL|PRIVATE_KEY/i.test(key) && process.env[key])
    throw Error('Retira el prefijo público de la variable secreta: '+key);
}
export default {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [{source: '/:path*', headers: [
      {key:'X-Content-Type-Options', value:'nosniff'},
      {key:'X-Frame-Options', value:'DENY'},
      {key:'Referrer-Policy', value:'no-referrer'},
      {key:'Permissions-Policy', value:'camera=(), microphone=(), geolocation=(), payment=()'},
      ...(process.env.APP_URL?.startsWith('https://') ? [{key:'Strict-Transport-Security', value:'max-age=31536000'}] : []),
    ]}, {source:'/api/:path*', headers:[{key:'Cache-Control',value:'private, no-store'}]}];
  },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
  serverExternalPackages: ['pdfjs-dist','mammoth','tesseract.js','@napi-rs/canvas','mysql2'],
  images: {unoptimized:true},
};
