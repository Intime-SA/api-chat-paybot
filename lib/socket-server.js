const { Server } = require("socket.io")
const { getDatabase } = require("./mongodb")
const { ObjectId } = require("mongodb")
const { findOrCreateUserByPhone, handleUserConnection, handleUserDisconnection } = require("./user-service")
const { addSocketToRoom, removeSocketFromRoom, getRoomConnections, reopenRoom } = require("./room-service")

function initSocketServer(server) {
  const io = new Server(server, {
    path: "/socket.io",
    addTrailingSlash: false,
    cors: {
      origin: true, // Allow all origins in serverless
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Force polling transport for serverless compatibility
    transports: ["polling"],
    allowEIO3: true,
  })

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
          const { connectedSockets } = await getRoomConnections(roomId)

          // Notify all users in the room about connected users
          io.to(roomId).emit("room-users", connectedSockets)

          // Store userId and roomId in socket for later use in disconnect
          socket.userId = userData.id
          socket.roomId = roomId

          const messages = await db.collection("messages").find({ roomId }).sort({ timestamp: 1 }).toArray()

          // Send existing messages to the user
          messages.forEach((message) => {
            socket.emit("chat-message", {
              id: message._id.toString(),
              content: message.content,
              timestamp: message.timestamp,
              socketId: message.socketId || message.userId, // Compatibility with old messages
            })
          })
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
        const { roomId, message, username } = data

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
          }

          const result = await db.collection("messages").insertOne(newMessage)

          const messageToSend = {
            id: result.insertedId.toString(),
            content: newMessage.content,
            timestamp: newMessage.timestamp,
            socketId: newMessage.socketId,
            username: newMessage.username,
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

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id)

      // Handle user disconnection if userId is available
      if (socket.userId && socket.roomId) {
        try {
          await handleUserDisconnection(socket.userId)

          // Remove socket from room and get updated connections
          await removeSocketFromRoom(socket.roomId, socket.id)
          const { connectedSockets } = await getRoomConnections(socket.roomId)

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

module.exports = { initSocketServer }
