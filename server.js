const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
require("dotenv").config()

const { initSocketServer } = require("./lib/socket-server")

// Import route handlers
const roomsRouter = require("./routes/rooms")
const messagesRouter = require("./routes/message")
const webhookRouter = require("./routes/webhook")
const usersRouter = require("./routes/users")
const contactRouter = require("./routes/contact")
const uploadRouter = require("./routes/upload")
const settingsRouter = require("./routes/settings")
const responsesRouter = require("./routes/responses")

const app = express()
const server = http.createServer(app)

// Initialize Socket.IO
const io = initSocketServer(server)

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const isDevelopment = process.env.NODE_ENV === "development"
    const allowedOrigins = isDevelopment
      ? ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]
      : process.env.ALLOWED_ORIGINS?.split(",") || ["https://yourdomain.com"]

    if (!origin) return callback(null, true)

    if (isDevelopment && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
      return callback(null, true)
    }

    if (!isDevelopment && allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    callback(new Error("Not allowed by CORS"))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}

app.use(cors(corsOptions))

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// API Routes
app.use("/api/rooms", roomsRouter)
app.use("/api/messages", messagesRouter)
app.use("/api/webhook", webhookRouter)
app.use("/api/users", usersRouter)
app.use("/api/contact", contactRouter)
app.use("/api/upload", uploadRouter)
app.use("/api/settings", settingsRouter)
app.use("/api/responses", responsesRouter)

// Socket.IO endpoint for client connections
app.get("/socket.io/*", (req, res) => {
  res.status(404).json({ error: "Socket.IO endpoint - use WebSocket connection" })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" })
})

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err)
  res.status(500).json({ error: "Internal server error" })
})

const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📡 Socket.IO server initialized`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("Process terminated")
  })
})
