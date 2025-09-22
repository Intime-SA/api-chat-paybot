# Node.js Socket.IO Chat API

API backend para sistema de chat en tiempo real con Socket.IO, MongoDB y Express.js, optimizada para deployment en Railway.

## Características

- ✅ Socket.IO para chat en tiempo real
- ✅ MongoDB para persistencia de datos
- ✅ Express.js como servidor web
- ✅ CORS configurado para desarrollo y producción
- ✅ Webhooks para creación automática de rooms
- ✅ API REST para gestión de rooms y mensajes
- ✅ Listo para deployment en Railway

## Endpoints

### Health Check
- `GET /health` - Estado del servidor

### Rooms
- `GET /api/rooms` - Listar todas las rooms
- `POST /api/rooms` - Crear nueva room
- `GET /api/rooms/:roomId` - Obtener room específica
- `DELETE /api/rooms/:roomId` - Eliminar room

### Messages
- `GET /api/messages/:roomId` - Obtener mensajes de una room

### Webhook
- `POST /api/webhook` - Crear room via webhook
- `GET /api/webhook` - Crear room via webhook (para testing)

### Socket.IO
- Conexión en `/socket.io`
- Eventos: `join-room`, `chat-message`

## Variables de Entorno

\`\`\`env
MONGODB_URI=mongodb+srv://...
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
API_URL=https://your-app.railway.app
\`\`\`

## Deployment en Railway

1. Conecta tu repositorio a Railway
2. Configura las variables de entorno
3. Railway detectará automáticamente el `package.json` y ejecutará `npm start`

## Desarrollo Local

\`\`\`bash
npm install
npm run dev
\`\`\`

El servidor estará disponible en `http://localhost:3000`
# api-chat-paybot
