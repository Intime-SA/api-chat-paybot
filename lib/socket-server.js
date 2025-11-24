const { Server } = require("socket.io")
const { getDatabase } = require("./mongodb")
const { ObjectId } = require("mongodb")
const { findOrCreateUserByPhone, handleUserConnection, handleUserDisconnection } = require("./user-service")
const { addSocketToRoom, removeSocketFromRoom, getRoomConnections, getRoomConnectionsWithRoles, reopenRoom } = require("./room-service")

// Global io instance to be accessible from other modules
let ioInstance = null

function initSocketServer(server) {
  const io = new Server(server, {
    path: "/socket.io",
    addTrailingSlash: false,
    cors: {
      origin: true, // Allow all origins in serverless
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Allow both polling and websocket transports
    transports: ["polling", "websocket"],
    allowEIO3: true,
    pingInterval: 25000,   // cada 25s manda un ping
    pingTimeout: 20000,    // si no responde en 20s, se desconecta
  })

  // Store io instance globally
  ioInstance = io

  io.on("connection", async (socket) => {
    
    console.log("User connected:", socket.id)

    // Join a specific room
    socket.on("join-room", async (roomId) => {
      try {
        socket.join(roomId)
        console.log(`User ${socket.id} joined room ${roomId}`)

        try {
          const db = await getDatabase()

          // Get room to find user phone
          const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })
          if (!room) {
            socket.emit("error", "Room not found")
            return
          }

          // Reopen room if it was closed
          if (room.status === "closed") {
            await reopenRoom(roomId)
            console.log(`Room ${roomId} reopened`)
          }

          // Find or create user by phone
          const userData = await findOrCreateUserByPhone(room.phone)

          // Handle user connection
          await handleUserConnection(userData.id, socket.id)

          // Add socket to room and get updated connections
          await addSocketToRoom(roomId, socket.id)
          const { connectedSockets } = await getRoomConnectionsWithRoles(roomId)

          // Notify all users in the room about connected users
          io.to(roomId).emit("room-users", connectedSockets)

          // Store userId and roomId in socket for later use in disconnect
          socket.userId = userData.id
          socket.roomId = roomId
        } catch (dbError) {
          console.warn("Database not available, room joined without message history:", dbError.message)
          socket.emit("warning", "Database not available - messages won't be saved")
        }
      } catch (error) {
        console.error("Error joining room:", error)
        socket.emit("error", "Failed to join room")
      }
    })

    // Handle chat messages
    socket.on("chat-message", async (data) => {
      try {
        const { roomId, message, username, type, welcome, read } = data

        try {
          const db = await getDatabase()

          const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })

          if (!room) {
            socket.emit("error", "Room not found")
            return
          }

          const newMessage = {
            content: message,
            timestamp: new Date().toISOString(),
            socketId: socket.id,
            username: username || `User-${socket.id.slice(0, 6)}`,
            roomId,
            phone: username,
            type: type || "text",
            welcome,
            read: read || false,
          }

          const result = await db.collection("messages").insertOne(newMessage)
          console.log("Message saved with read status:", newMessage.read) // Debug log

          const messageToSend = {
            id: result.insertedId.toString(),
            content: newMessage.content,
            timestamp: newMessage.timestamp,
            socketId: newMessage.socketId,
            username: newMessage.username,
            phone: newMessage.phone,
            type: newMessage.type,
            welcome: newMessage.welcome,
            read: newMessage.read,
          }

          // Broadcast to all users in the room
          io.to(roomId).emit("chat-message", messageToSend)
        } catch (dbError) {
          console.warn("Database not available, sending message locally:", dbError.message)

          // Send message locally without saving to database
          const localMessage = {
            id: Date.now().toString(),
            content: message,
            timestamp: new Date().toISOString(),
            socketId: socket.id,
            username: username || `User-${socket.id.slice(0, 6)}`,
            type: type || "text",
            welcome: welcome || false,
            read: read || false,
          }

          // Broadcast to all users in the room (but won't persist)
          io.to(roomId).emit("chat-message", localMessage)
          socket.emit("warning", "Message sent locally - not saved to database")
        }
      } catch (error) {
        console.error("Error sending message:", error)
        socket.emit("error", "Failed to send message")
      }
    })

    // Handle user disconnection
    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id)

      // Handle user disconnection if userId is available
      if (socket.userId && socket.roomId) {
        try {
          await handleUserDisconnection(socket.userId)

          // Remove socket from room and get updated connections
          await removeSocketFromRoom(socket.roomId, socket.id)
          const { connectedSockets } = await getRoomConnectionsWithRoles(socket.roomId)

          // Notify remaining users in the room about connected users
          io.to(socket.roomId).emit("room-users", connectedSockets)
        } catch (error) {
          console.error("Error handling user disconnection:", error)
        }
      }
    })
  })

  return io
}

// Function to manually disconnect a socket from a room
async function disconnectSocketFromRoom(roomId, socketId, reason = "manual_disconnect") {
  try {
    if (!ioInstance) {
      throw new Error("Socket server not initialized")
    }

    // Find the socket
    const socket = ioInstance.sockets.sockets.get(socketId)
    if (!socket) {
      console.log(`Socket ${socketId} not found in active connections`)
      // Even if socket is not active, clean up database
    }

    // Find user by socketId
    const db = await getDatabase()
    const user = await db.collection("users").findOne({ socketId })

    if (user) {
      // Handle user disconnection in database
      await handleUserDisconnection(user._id.toString())

      // Remove socket from room
      await removeSocketFromRoom(roomId, socketId)

      // If socket is still active, disconnect it
      if (socket) {
        socket.emit("disconnected", { reason })
        socket.disconnect(true)
        console.log(`Socket ${socketId} manually disconnected from room ${roomId}`)
      }

      // Notify remaining users in the room
      const { connectedSockets } = await getRoomConnectionsWithRoles(roomId)
      ioInstance.to(roomId).emit("room-users", connectedSockets)

      return {
        success: true,
        message: `Socket ${socketId} disconnected from room ${roomId}`,
        userId: user._id.toString(),
        remainingConnections: connectedSockets.length
      }
    } else {
      // Socket not found in database, just remove from room if exists
      await removeSocketFromRoom(roomId, socketId)

      if (socket) {
        socket.emit("disconnected", { reason })
        socket.disconnect(true)
      }

      const { connectedSockets } = await getRoomConnectionsWithRoles(roomId)
      ioInstance.to(roomId).emit("room-users", connectedSockets)

      return {
        success: true,
        message: `Socket ${socketId} removed from room ${roomId} (no user record found)`,
        remainingConnections: connectedSockets.length
      }
    }
  } catch (error) {
    console.error("Error disconnecting socket from room:", error)
    throw new Error(`Failed to disconnect socket: ${error.message}`)
  }
}

// Function to get the io instance (for external use)
function getSocketIO() {
  return ioInstance
}

module.exports = { initSocketServer, disconnectSocketFromRoom, getSocketIO }
