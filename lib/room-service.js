const { getDatabase } = require("./mongodb")
const { ObjectId } = require("mongodb")

async function createRoom(params) {
  try {
    const db = await getDatabase()

  const { phone, channel, source, name, userAgent = "Unknown", ipAddress = "Unknown", createdFrom = "webhook", userId } = params

  // Generar nombre automático si no se proporciona
  const roomName = name || `Chat-${phone}-${channel}-${Date.now()}`

  const newRoom = {
    name: roomName,
    phone,
    channel,
    source,
    status: "open", // "open" | "closed"
    openedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdFrom,
    connectedSockets: [],
    metadata: {
      userAgent,
      ipAddress,
      timestamp: new Date().toISOString(),
      apiVersion: "v1",
    },
  }

  // Add userId if provided
  if (userId) {
    newRoom.userId = new ObjectId(userId)
  }

    const result = await db.collection("rooms").insertOne(newRoom)

    return {
      id: result.insertedId.toString(),
      name: roomName,
      phone,
      channel,
      source,
      createdAt: newRoom.createdAt,
      createdFrom: newRoom.createdFrom,
      messageCount: 0,
      metadata: newRoom.metadata,
    }
  } catch (error) {
    console.error("Error creating room:", error)
    throw new Error(`Failed to create room: ${error.message}`)
  }
}

// Add socket to room connections
async function addSocketToRoom(roomId, socketId) {
  try {
    const db = await getDatabase()

    // First, ensure room is open
    await db.collection("rooms").updateOne(
      { _id: new ObjectId(roomId) },
      {
        $set: { status: "open", openedAt: new Date().toISOString() },
        $addToSet: { connectedSockets: socketId },
        $unset: { closedAt: 1 } // Remove closedAt if exists
      }
    )
  } catch (error) {
    console.error("Error adding socket to room:", error)
    throw new Error(`Failed to add socket to room: ${error.message}`)
  }
}

// Remove socket from room connections
async function removeSocketFromRoom(roomId, socketId) {
  try {
    const db = await getDatabase()

    const result = await db.collection("rooms").updateOne(
      { _id: new ObjectId(roomId) },
      { $pull: { connectedSockets: socketId } }
    )

    // Check if room is now empty
    const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })

    if (room && room.connectedSockets.length === 0) {
      // Close the room if no sockets are connected
      await db.collection("rooms").updateOne(
        { _id: new ObjectId(roomId) },
        {
          $set: {
            status: "closed",
            closedAt: new Date().toISOString()
          }
        }
      )
      console.log(`Room ${roomId} closed - no active connections`)
    }

    return result
  } catch (error) {
    console.error("Error removing socket from room:", error)
    throw new Error(`Failed to remove socket from room: ${error.message}`)
  }
}

// Get room connections
async function getRoomConnections(roomId) {
  try {
    const db = await getDatabase()
    const room = await db.collection("rooms").findOne(
      { _id: new ObjectId(roomId) },
      { connectedSockets: 1, status: 1 }
    )

    return {
      connectedSockets: room?.connectedSockets || [],
      status: room?.status || "closed"
    }
  } catch (error) {
    console.error("Error getting room connections:", error)
    throw new Error(`Failed to get room connections: ${error.message}`)
  }
}

// Reopen closed room
async function reopenRoom(roomId) {
  try {
    const db = await getDatabase()

    await db.collection("rooms").updateOne(
      { _id: new ObjectId(roomId) },
      {
        $set: {
          status: "open",
          openedAt: new Date().toISOString()
        },
        $unset: { closedAt: 1 }
      }
    )
  } catch (error) {
    console.error("Error reopening room:", error)
    throw new Error(`Failed to reopen room: ${error.message}`)
  }
}

module.exports = {
  createRoom,
  addSocketToRoom,
  removeSocketFromRoom,
  getRoomConnections,
  reopenRoom
}
