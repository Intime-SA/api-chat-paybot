const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")
const { createRoom, getRoomConnections, getRoomConnectionsWithRoles } = require("../lib/room-service")
const { disconnectSocketFromRoom } = require("../lib/socket-server")

const router = express.Router()

// Get all rooms or search by phone
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { page = 1, limit = 20, phone = "" } = req.query

    // If phone parameter is provided, search for room by phone (partial match)
    if (phone) {
      const db = await getDatabase()

      try {
        // Search for room with partial phone number match using regex
        const room = await db.collection("rooms").findOne({
          phone: { $regex: phone, $options: "i" }
        })

        if (!room) {
          return res.status(404).json({ error: "No room found for the provided phone number" })
        }

        // Generate the join URL
        const joinUrl = `${process.env.APP_DOMAIN}/chat/${room._id.toString()}?phone=${room.phone}`

        return res.json({
          joinRoom: joinUrl,
          roomId: room._id.toString()
        })
      } catch (dbError) {
        console.warn("Database not available:", dbError.message)
        return res.status(503).json({ error: "Database not available" })
      }
    }

    // If no phone parameter, return all rooms with pagination
    const db = await getDatabase()

    try {
      const skip = (Number(page) - 1) * Number(limit)

      const rooms = await db
        .collection("rooms")
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray()

      const roomsWithDetails = await Promise.all(
        rooms.map(async (room) => {
          const chatMessageCount = await db.collection("messages").countDocuments({ roomId: room._id.toString() })
          const whatsappMessageCount = await db.collection("wati-messages").countDocuments({ phone: room.phone })
          const totalMessageCount = chatMessageCount + whatsappMessageCount
          const { connectedSockets, status, connectedCount } = await getRoomConnectionsWithRoles(room._id.toString())

          return {
            id: room._id.toString(),
            name: room.name,
            phone: room.phone,
            channel: room.channel,
            source: room.source,
            username: room.username,
            status: room.status || status,
            openedAt: room.openedAt,
            closedAt: room.closedAt,
            createdAt: room.createdAt,
            createdFrom: room.createdFrom,
            connectedSockets,
            connectedCount,
            messageCount: totalMessageCount,
            metadata: room.metadata,
            contactId: room.contactId,
          }
        }),
      )

      res.json(roomsWithDetails)
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.json([]) // Return empty array when database is not available
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})



// Create new room
router.post("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { phone, channel, source, name } = req.body

    if (!phone || !channel || !source) {
      return res.status(400).json({
        error: "Missing required fields: phone, channel, source",
      })
    }

    const userAgent = req.headers["user-agent"] || "Unknown"
    const ipAddress =
      req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.connection.remoteAddress || "Unknown"

    const roomData = await createRoom({
      phone,
      channel,
      source,
      name,
      userAgent,
      ipAddress,
      createdFrom: "api",
    })

    res.status(201).json(roomData)
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get specific room
router.get("/:roomId", async (req, res) => {
  if (handleCors(req, res)) return

  const { roomId } = req.params

  if (!ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: "Invalid room ID" })
  }

  try {
    const db = await getDatabase()
    const room = await db.collection("rooms").findOne({
      _id: new ObjectId(roomId),
    })

    if (!room) {
      return res.status(404).json({ error: "Room not found" })
    }

    const chatMessageCount = await db.collection("messages").countDocuments({ roomId })
    const whatsappMessageCount = await db.collection("wati-messages").countDocuments({ phone: room.phone })
    const messageCount = chatMessageCount + whatsappMessageCount

    res.json({
      id: room._id.toString(),
      name: room.name,
      phone: room.phone,
      channel: room.channel,
      source: room.source,
      username: room.username,
      createdAt: room.createdAt,
      createdFrom: room.createdFrom,
      messageCount,
      metadata: room.metadata,
      contactId: room.contactId,
    })
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get specific room with connections
router.get("/:roomId", async (req, res) => {
  if (handleCors(req, res)) return

  const { roomId } = req.params

  if (!ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: "Invalid room ID" })
  }

  try {
    const db = await getDatabase()

    try {
      const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })

      if (!room) {
        return res.status(404).json({ error: "Room not found" })
      }

      const chatMessageCount = await db.collection("messages").countDocuments({ roomId })
      const whatsappMessageCount = await db.collection("wati-messages").countDocuments({ phone: room.phone })
      const messageCount = chatMessageCount + whatsappMessageCount
      const { connectedSockets, status, connectedCount } = await getRoomConnectionsWithRoles(roomId)

      const roomDetails = {
        id: room._id.toString(),
        name: room.name,
        phone: room.phone,
        channel: room.channel,
        source: room.source,
        username: room.username,
        status: room.status || status,
        openedAt: room.openedAt,
        closedAt: room.closedAt,
        createdAt: room.createdAt,
        createdFrom: room.createdFrom,
        connectedSockets,
        connectedCount,
        messageCount,
        metadata: room.metadata,
        contactId: room.contactId,
      }

      res.json(roomDetails)
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.status(503).json({ error: "Database not available" })
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete room
router.delete("/:roomId", async (req, res) => {
  if (handleCors(req, res)) return

  const { roomId } = req.params

  if (!ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: "Invalid room ID" })
  }

  try {
    const db = await getDatabase()
    const room = await db.collection("rooms").findOne({
      _id: new ObjectId(roomId),
    })

    if (!room) {
      return res.status(404).json({ error: "Room not found" })
    }

    // Delete room and all its messages
    await Promise.all([
      db.collection("rooms").deleteOne({ _id: new ObjectId(roomId) }),
      db.collection("messages").deleteMany({ roomId }),
    ])

    res.json({ message: "Room deleted successfully" })
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get all connections (active and inactive) sorted by last connection date
router.get("/connections/status", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const db = await getDatabase()

    try {
      const { page = 1, limit = 20 } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      // Use aggregation to sort by last connection date
      // For open rooms: use openedAt
      // For closed rooms: use closedAt if exists, otherwise openedAt
      const rooms = await db
        .collection("rooms")
        .aggregate([
          {
            $addFields: {
              lastConnectionDate: {
                $cond: {
                  if: { $eq: ["$status", "open"] },
                  then: "$openedAt",
                  else: {
                    $ifNull: ["$closedAt", "$openedAt"]
                  }
                }
              }
            }
          },
          {
            $sort: { lastConnectionDate: -1 }
          },
          {
            $skip: skip
          },
          {
            $limit: Number(limit)
          }
        ])
        .toArray()

      const roomsWithDetails = await Promise.all(
        rooms.map(async (room) => {
          const chatMessageCount = await db.collection("messages").countDocuments({ roomId: room._id.toString() })
          const whatsappMessageCount = await db.collection("wati-messages").countDocuments({ phone: room.phone })
          const totalMessageCount = chatMessageCount + whatsappMessageCount
          const { connectedSockets, status, connectedCount } = await getRoomConnectionsWithRoles(room._id.toString())

          return {
            id: room._id.toString(),
            name: room.name,
            phone: room.phone,
            channel: room.channel,
            source: room.source,
            username: room.username,
            status: room.status || status,
            openedAt: room.openedAt,
            closedAt: room.closedAt,
            createdAt: room.createdAt,
            createdFrom: room.createdFrom,
            lastConnectionDate: room.lastConnectionDate,
            connectedSockets,
            connectedCount,
            messageCount: totalMessageCount,
            metadata: room.metadata,
            contactId: room.contactId,
          }
        }),
      )

      // Get total count for pagination info
      const totalCount = await db.collection("rooms").countDocuments({})
      const totalPages = Math.ceil(totalCount / Number(limit))

      res.json({
        connections: roomsWithDetails,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: Number(limit),
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1
        }
      })
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.json({
        connections: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          limit: 20,
          hasNextPage: false,
          hasPrevPage: false
        }
      })
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Disconnect socket from room
router.post("/disconnect", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { roomId, socketId, reason } = req.body

    if (!roomId || !socketId) {
      return res.status(400).json({
        error: "Missing required fields: roomId and socketId are required",
      })
    }

    if (!ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" })
    }

    // Verify room exists
    const db = await getDatabase()
    const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })

    if (!room) {
      return res.status(404).json({ error: "Room not found" })
    }

    // Check if socket is connected to this room
    if (!room.connectedSockets.includes(socketId)) {
      return res.status(400).json({
        error: `Socket ${socketId} is not connected to room ${roomId}`
      })
    }

    try {
      // Disconnect socket from room (both socket and database)
      const result = await disconnectSocketFromRoom(roomId, socketId, reason || "manual_disconnect")

      res.json({
        success: true,
        message: result.message,
        data: {
          roomId,
          socketId,
          userId: result.userId,
          remainingConnections: result.remainingConnections,
          reason: reason || "manual_disconnect"
        }
      })
    } catch (disconnectError) {
      console.error("Error disconnecting socket:", disconnectError)
      res.status(500).json({ error: `Failed to disconnect socket: ${disconnectError.message}` })
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Disconnect all sockets from a room
router.post("/:roomId/disconnect-all", async (req, res) => {
  if (handleCors(req, res)) return

  const { roomId } = req.params
  const { reason } = req.body

  if (!ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: "Invalid room ID" })
  }

  try {
    // Get room connections
    const { connectedSockets } = await getRoomConnectionsWithRoles(roomId)

    if (connectedSockets.length === 0) {
      return res.json({
        success: true,
        message: "No sockets connected to room",
        data: { roomId, disconnectedCount: 0 }
      })
    }

    // Disconnect all sockets
    const disconnectPromises = connectedSockets.map(socket =>
      disconnectSocketFromRoom(roomId, socket.socketId, reason || "room_cleanup")
    )

    const results = await Promise.allSettled(disconnectPromises)

    const successful = results.filter(result => result.status === "fulfilled").length
    const failed = results.filter(result => result.status === "rejected").length

    res.json({
      success: true,
      message: `Disconnected ${successful} sockets from room ${roomId}${failed > 0 ? ` (${failed} failed)` : ""}`,
      data: {
        roomId,
        totalSockets: connectedSockets.length,
        disconnectedCount: successful,
        failedCount: failed,
        reason: reason || "room_cleanup"
      }
    })
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
