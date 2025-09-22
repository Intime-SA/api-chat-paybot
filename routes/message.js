const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Get messages for a room
router.get("/:roomId", async (req, res) => {
  if (handleCors(req, res)) return

  const { roomId } = req.params

  if (!ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: "Invalid room ID" })
  }

  try {
    const db = await getDatabase()

    try {
      const { page = 1, limit = 50 } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      const messages = await db
        .collection("messages")
        .find({ roomId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray()

      const formattedMessages = messages.reverse().map((msg) => ({
        id: msg._id.toString(),
        content: msg.content,
        timestamp: msg.timestamp,
        userId: msg.userId,
        username: msg.username || `User-${msg.userId.slice(0, 6)}`,
      }))

      res.json(formattedMessages)
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.json([]) // Return empty array when database is not available
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
