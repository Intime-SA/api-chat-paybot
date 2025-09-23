const express = require("express")
const { handleCors } = require("../lib/cors")
const { createRoom } = require("../lib/room-service")
const { findOrCreateUserByPhone, updateUserWithRoom } = require("../lib/user-service")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")

const router = express.Router()

// Function to convert timestamp to ISO string UTC Argentina (UTC-3)
function convertTimestampToArgentinaISO(timestamp) {
  // Convert Unix timestamp to milliseconds
  const date = new Date(parseInt(timestamp) * 1000)
  // Convert to Argentina timezone (UTC-3)
  const argentinaTime = new Date(date.getTime() - (3 * 60 * 60 * 1000))
  return argentinaTime.toISOString()
}

// Webhook endpoint for creating rooms via query parameters
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { phone, channel, source } = req.query

    // Validate required parameters
    if (!phone || !channel || !source) {
      return res.status(400).json({
        error: "Missing required parameters: phone, channel, source",
        received: { phone, channel, source }
      })
    }

    // Get request metadata
    const userAgent = req.headers["user-agent"] || "Unknown"
    const ipAddress =
      req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.connection.remoteAddress || "Unknown"

    // Handle user creation/verification first
    const userData = await findOrCreateUserByPhone(phone)

    // Create the room with userId
    const roomData = await createRoom({
      phone,
      channel,
      source,
      userAgent,
      ipAddress,
      createdFrom: "webhook",
      userId: userData.id,
    })

    // Update user with room
    await updateUserWithRoom(userData.id, roomData.id)

    // Generate invitation link
    const baseUrl = `https://chat.paybot.app`//`${req.protocol}://${req.get('host')}`
    const inviteLink = `${baseUrl}/chat/${roomData.id}?phone=${phone}`

    // Return response with link property
    res.status(201).json({
      ...roomData,
      userId: userData.id,
      link: inviteLink
    })

  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Webhook endpoint for WATI - logs all body content and saves to database
router.post("/webhook-wati", async (req, res) => {
  try {
    console.log("Webhook WATI received body:", JSON.stringify(req.body, null, 2))

    // Extract data from request body
    const {
      senderName,
      waId,
      text,
      type,
      id,
      conversationId,
      ticketId,
      timestamp
    } = req.body

    // Save to database
    const db = await getDatabase()

    // Find room by phone number
    const room = await db.collection("rooms").findOne({ phone: waId })

    // Prepare data for database
    const messageData = {
      username: senderName,
      phone: waId,
      message: text,
      type_message: type,
      messageId: id,
      conversationId: conversationId,
      ticketId: ticketId,
      date: convertTimestampToArgentinaISO(timestamp),
      roomId: room ? new ObjectId(room._id) : null
    }

    const collection = db.collection('wati-messages')
    await collection.insertOne(messageData)

    console.log("Message saved to wati-messages collection:", messageData)

    res.status(200).json({ status: "received and saved" })
  } catch (error) {
    console.error("Error saving WATI message:", error)
    res.status(500).json({ error: "Failed to save message" })
  }
})

module.exports = router
