const express = require("express")
const { handleCors } = require("../lib/cors")
const { createRoom } = require("../lib/room-service")

const router = express.Router()

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

    // Create the room
    const roomData = await createRoom({
      phone,
      channel,
      source,
      userAgent,
      ipAddress,
      createdFrom: "webhook",
    })

    // Generate invitation link
    const baseUrl = `https://paybot-chats-r8m7.vercel.app`//`${req.protocol}://${req.get('host')}`
    const inviteLink = `${baseUrl}/chat/${roomData.id}`

    // Return response with link property
    res.status(201).json({
      ...roomData,
      link: inviteLink
    })

  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
