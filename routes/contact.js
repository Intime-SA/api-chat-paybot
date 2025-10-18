const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Create new contact and update related messages and rooms
router.post("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { source, phone, username, notes = "", tags = "" } = req.body

    // Validate required fields
    if (!source || !phone || !username) {
      return res.status(400).json({
        error: "Missing required fields: source, phone, and username are required",
      })
    }

    const db = await getDatabase()

    try {
      // Create new contact
      const contactData = {
        source,
        phone,
        username,
        notes,
        tags,
        createdAt: new Date().toISOString(),
      }

      const contactResult = await db.collection("contacts").insertOne(contactData)
      const contactId = contactResult.insertedId

      // Update all rooms with matching phone number
      const roomsUpdateResult = await db.collection("rooms").updateMany(
        { phone: phone },
        {
          $set: {
            contactId: contactId,
            username: username
          }
        }
      )

      // Update all messages with matching phone number (both chat messages and whatsapp messages)
      const messagesUpdateResult = await db.collection("messages").updateMany(
        { phone: phone },
        { $set: { contactId: contactId } }
      )

      const whatsappMessagesUpdateResult = await db.collection("wati-messages").updateMany(
        { phone: phone },
        { $set: { contactId: contactId } }
      )

      res.status(201).json({
        contact: {
          _id: contactId.toString(),
          source,
          phone,
          username,
          notes,
          tags,
          createdAt: contactData.createdAt,
        },
        updates: {
          roomsUpdated: roomsUpdateResult.modifiedCount,
          messagesUpdated: messagesUpdateResult.modifiedCount,
          whatsappMessagesUpdated: whatsappMessagesUpdateResult.modifiedCount,
        }
      })
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.status(503).json({ error: "Database not available" })
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
