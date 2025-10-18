const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Get all users
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const db = await getDatabase()

    try {
      const users = await db
        .collection("users")
        .find({})
        .sort({ createdAt: -1 })
        .toArray()

      // Transform users to match frontend expectations
      const transformedUsers = users.map(user => ({
        _id: user._id.toString(),
        phone: user.phone,
        rooms: user.rooms || [],
        createdAt: user.createdAt,
        role: user.role || "user",
        updatedAt: user.updatedAt,
        connectedAt: user.connectedAt,
        disconnectedAt: user.disconnectedAt,
        isConnected: user.isConnected || false,
        socketId: user.socketId
      }))

      res.json(transformedUsers)
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
