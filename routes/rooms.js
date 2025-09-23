const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")
const { createRoom, getRoomConnections } = require("../lib/room-service")

const router = express.Router()

// Get all rooms
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const db = await getDatabase()

    try {
    const { page = 1, limit = 20 } = req.query
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
        const messageCount = await db.collection("messages").countDocuments({ roomId: room._id.toString() })
        const { connectedSockets, status } = await getRoomConnections(room._id.toString())

        return {
          id: room._id.toString(),
          name: room.name,
          phone: room.phone,
          channel: room.channel,
          source: room.source,
          status: room.status || status,
          openedAt: room.openedAt,
          closedAt: room.closedAt,
          createdAt: room.createdAt,
          createdFrom: room.createdFrom,
          connectedSockets,
          connectedCount: connectedSockets.length,
          messageCount,
          metadata: room.metadata,
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

    const messageCount = await db.collection("messages").countDocuments({ roomId })

    res.json({
      id: room._id.toString(),
      name: room.name,
      phone: room.phone,
      channel: room.channel,
      source: room.source,
      createdAt: room.createdAt,
      createdFrom: room.createdFrom,
      messageCount,
      metadata: room.metadata,
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

      const messageCount = await db.collection("messages").countDocuments({ roomId })
      const { connectedSockets, status } = await getRoomConnections(roomId)

      const roomDetails = {
        id: room._id.toString(),
        name: room.name,
        phone: room.phone,
        channel: room.channel,
        source: room.source,
        status: room.status || status,
        openedAt: room.openedAt,
        closedAt: room.closedAt,
        createdAt: room.createdAt,
        createdFrom: room.createdFrom,
        connectedSockets,
        connectedCount: connectedSockets.length,
        messageCount,
        metadata: room.metadata,
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

module.exports = router
