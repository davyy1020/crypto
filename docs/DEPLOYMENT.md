# Deployment Guide

## Backend

Recommended hosting:
- VPS
- Railway
- Render
- Fly.io

Production command:

```bash
cd backend
npm install
npm start
```

For VPS, use PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name crypto-dashboard-backend
pm2 save
```

## Frontend

Recommended hosting:
- Vercel
- Netlify
- Cloudflare Pages

Build command:

```bash
cd frontend
npm install
npm run build
```

Set environment variable:

```env
VITE_WS_URL=wss://your-backend-domain.com
```

## Production Checklist

- Use HTTPS and WSS.
- Add rate limiting for backend API routes.
- Add logging and monitoring.
- Use PM2/Docker for backend process manager.
- Add Redis if using multiple backend instances.
