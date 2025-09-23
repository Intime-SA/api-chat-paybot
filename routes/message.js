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

      // Get room details to obtain phone number
      const room = await db.collection("rooms").findOne({ _id: new ObjectId(roomId) })
      if (!room) {
        return res.status(404).json({ error: "Room not found" })
      }

      // Get regular chat messages
      const chatMessages = await db
        .collection("messages")
        .find({ roomId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray()

      // Get WhatsApp messages for this room
      const whatsappMessages = await db
        .collection("wati-messages")
        .find({ roomId: new ObjectId(roomId) })
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray()

      // Format chat messages
      const formattedChatMessages = chatMessages.map((msg) => ({
        id: msg._id.toString(),
        content: msg.content,
        timestamp: msg.timestamp,
        socketId: msg.socketId || msg.userId,
        username: msg.username || `User-${(msg.socketId || msg.userId).slice(0, 6)}`,
        type: "chat", // Add type to distinguish message sources
        source: "chat"
      }))

      // Format WhatsApp messages
      const formattedWhatsappMessages = whatsappMessages.map((msg) => ({
        id: msg.messageId,
        content: msg.message,
        timestamp: new Date(msg.date).getTime(), // Convert ISO string back to timestamp for consistency
        username: msg.username,
        type: msg.type_message,
        source: "whatsapp",
        phone: msg.phone,
        conversationId: msg.conversationId,
        ticketId: msg.ticketId
      }))

      // Combine and sort all messages chronologically
      const allMessages = [...formattedChatMessages, ...formattedWhatsappMessages]
        .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp ascending (chronological)

      // Apply pagination to the combined result
      const startIndex = skip
      const endIndex = startIndex + Number(limit)
      const paginatedMessages = allMessages.slice(startIndex, endIndex)

      res.json(paginatedMessages)
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
