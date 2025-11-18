const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Get all contacts with pagination
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { page = 1, limit = 20, phone = "", username = "" } = req.query

    const db = await getDatabase()

    try {
      // Build query object
      const query = {}
      if (phone) {
        query.phone = { $regex: phone, $options: "i" }
      }
      if (username) {
        query.username = { $regex: username, $options: "i" }
      }

      const skip = (Number(page) - 1) * Number(limit)

      const contacts = await db
        .collection("contacts")
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray()

      // Get total count for pagination info
      const totalCount = await db.collection("contacts").countDocuments(query)
      const totalPages = Math.ceil(totalCount / Number(limit))

      // Transform contacts to match expected format
      const transformedContacts = contacts.map(contact => ({
        _id: contact._id.toString(),
        source: contact.source,
        phone: contact.phone,
        username: contact.username,
        notes: contact.notes || "",
        tags: contact.tags || "",
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      }))

      res.json({
        contacts: transformedContacts,
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
        contacts: [],
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
      // Check if phone already exists
      const existingPhone = await db.collection("contacts").findOne({ phone })
      if (existingPhone) {
        return res.status(409).json({
          error: "A contact with this phone number already exists",
          existingContact: {
            _id: existingPhone._id.toString(),
            username: existingPhone.username,
            source: existingPhone.source
          }
        })
      }

      // Check if username already exists
      const existingUsername = await db.collection("contacts").findOne({ username })
      if (existingUsername) {
        return res.status(409).json({
          error: "A contact with this username already exists",
          existingContact: {
            _id: existingUsername._id.toString(),
            phone: existingUsername.phone,
            source: existingUsername.source
          }
        })
      }

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


// Update contact and related references
router.put("/:contactId", async (req, res) => {
  if (handleCors(req, res)) return

  const { contactId } = req.params

  if (!ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: "Invalid contact ID" })
  }

  try {
    const updateData = req.body
    const allowedFields = ["source", "phone", "username", "notes", "tags"]

    // Filter only allowed fields
    const filteredUpdateData = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field]
      }
    }

    // Validate required fields if provided
    if (filteredUpdateData.source !== undefined && !filteredUpdateData.source) {
      return res.status(400).json({ error: "Source cannot be empty" })
    }

    if (filteredUpdateData.phone !== undefined && !filteredUpdateData.phone) {
      return res.status(400).json({ error: "Phone cannot be empty" })
    }

    if (filteredUpdateData.username !== undefined && !filteredUpdateData.username) {
      return res.status(400).json({ error: "Username cannot be empty" })
    }

    const db = await getDatabase()

    try {
      // Get current contact data before update
      const currentContact = await db.collection("contacts").findOne({
        _id: new ObjectId(contactId)
      })

      if (!currentContact) {
        return res.status(404).json({ error: "Contact not found" })
      }

      // Check if phone already exists (excluding current contact)
      if (filteredUpdateData.phone && filteredUpdateData.phone !== currentContact.phone) {
        const existingPhone = await db.collection("contacts").findOne({
          phone: filteredUpdateData.phone,
          _id: { $ne: new ObjectId(contactId) }
        })
        if (existingPhone) {
          return res.status(409).json({
            error: "A contact with this phone number already exists",
            existingContact: {
              _id: existingPhone._id.toString(),
              username: existingPhone.username,
              source: existingPhone.source
            }
          })
        }
      }

      // Check if username already exists (excluding current contact)
      if (filteredUpdateData.username && filteredUpdateData.username !== currentContact.username) {
        const existingUsername = await db.collection("contacts").findOne({
          username: filteredUpdateData.username,
          _id: { $ne: new ObjectId(contactId) }
        })
        if (existingUsername) {
          return res.status(409).json({
            error: "A contact with this username already exists",
            existingContact: {
              _id: existingUsername._id.toString(),
              phone: existingUsername.phone,
              source: existingUsername.source
            }
          })
        }
      }

      // Add updatedAt timestamp
      filteredUpdateData.updatedAt = new Date().toISOString()

      // Update contact
      const result = await db.collection("contacts").updateOne(
        { _id: new ObjectId(contactId) },
        { $set: filteredUpdateData }
      )

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Contact not found" })
      }

      // If phone changed, update all related references
      if (filteredUpdateData.phone && filteredUpdateData.phone !== currentContact.phone) {
        // Update rooms
        const roomsUpdateResult = await db.collection("rooms").updateMany(
          { phone: currentContact.phone },
          {
            $set: {
              phone: filteredUpdateData.phone,
              username: filteredUpdateData.username || currentContact.username
            }
          }
        )

        // Update messages
        const messagesUpdateResult = await db.collection("messages").updateMany(
          { phone: currentContact.phone },
          { $set: { phone: filteredUpdateData.phone } }
        )

        // Update whatsapp messages
        const whatsappMessagesUpdateResult = await db.collection("wati-messages").updateMany(
          { phone: currentContact.phone },
          { $set: { phone: filteredUpdateData.phone } }
        )
      } else if (filteredUpdateData.username && filteredUpdateData.username !== currentContact.username) {
        // If only username changed, update rooms
        const roomsUpdateResult = await db.collection("rooms").updateMany(
          { phone: currentContact.phone },
          { $set: { username: filteredUpdateData.username } }
        )
      }

      // If tags changed, update all related references
      if (filteredUpdateData.tags !== undefined && filteredUpdateData.tags !== currentContact.tags) {
        // Update rooms with new tags
        const roomsTagsUpdateResult = await db.collection("rooms").updateMany(
          { contactId: new ObjectId(contactId) },
          { $set: { tags: filteredUpdateData.tags } }
        )

        // Update messages with new tags
        const messagesTagsUpdateResult = await db.collection("messages").updateMany(
          { contactId: new ObjectId(contactId) },
          { $set: { tags: filteredUpdateData.tags } }
        )

        // Update whatsapp messages with new tags
        const whatsappMessagesTagsUpdateResult = await db.collection("wati-messages").updateMany(
          { contactId: new ObjectId(contactId) },
          { $set: { tags: filteredUpdateData.tags } }
        )
      }

      // Get updated contact
      const updatedContact = await db.collection("contacts").findOne({
        _id: new ObjectId(contactId)
      })

      const transformedContact = {
        _id: updatedContact._id.toString(),
        source: updatedContact.source,
        phone: updatedContact.phone,
        username: updatedContact.username,
        notes: updatedContact.notes || "",
        tags: updatedContact.tags || "",
        createdAt: updatedContact.createdAt,
        updatedAt: updatedContact.updatedAt
      }

      res.json(transformedContact)
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
