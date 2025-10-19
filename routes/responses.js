const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Get all responses or filter by atajo (flexible search)
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { atajo = "" } = req.query
    const db = await getDatabase()

    try {
      let query = {}

      // If atajo parameter is provided, search flexibly (case insensitive, partial match)
      if (atajo) {
        query.atajo = { $regex: atajo, $options: "i" }
      }

      const responses = await db
        .collection("responses")
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()

      // Transform responses to ensure proper format
      const transformedResponses = responses.map(response => ({
        _id: response._id.toString(),
        atajo: response.atajo,
        text: response.text,
        image: response.image,
        type: response.type,
        status: response.status,
        triggers: response.triggers || [],
        createdAt: response.createdAt,
        updatedAt: response.updatedAt
      }))

      res.json(transformedResponses)
    } catch (dbError) {
      console.warn("Database not available:", dbError.message)
      res.json([]) // Return empty array when database is not available
    }
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create new response
router.post("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const { atajo, text, image = "", type, status = true, triggers = [] } = req.body

    // Validate required fields
    if (!atajo || !type) {
      return res.status(400).json({
        error: "Missing required fields: atajo and type are required"
      })
    }

    // Validate text based on type
    if (type === "text" && (!text || text.trim() === "")) {
      return res.status(400).json({
        error: "Text is required for responses of type 'text'"
      })
    }

    if (type === "mixed" && (!text || text.trim() === "")) {
      return res.status(400).json({
        error: "Text is required for responses of type 'mixed'"
      })
    }

    // Validate type
    if (!["text", "image", "mixed"].includes(type)) {
      return res.status(400).json({
        error: "Invalid type. Must be 'text', 'image', or 'mixed'"
      })
    }

    // Validate status is boolean
    if (typeof status !== "boolean") {
      return res.status(400).json({
        error: "Status must be a boolean value"
      })
    }

    // Validate triggers is an array
    if (!Array.isArray(triggers)) {
      return res.status(400).json({
        error: "Triggers must be an array of strings"
      })
    }

    const db = await getDatabase()

    // Check if atajo already exists
    const existingResponse = await db.collection("responses").findOne({ atajo })
    if (existingResponse) {
      return res.status(409).json({
        error: "A response with this atajo already exists"
      })
    }

    const now = new Date()
    const responseData = {
      atajo,
      text,
      image,
      type,
      status,
      triggers,
      createdAt: now,
      updatedAt: now
    }

    const result = await db.collection("responses").insertOne(responseData)

    const createdResponse = {
      _id: result.insertedId.toString(),
      ...responseData
    }

    res.status(201).json(createdResponse)
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update existing response
router.put("/:responseId", async (req, res) => {
  if (handleCors(req, res)) return

  const { responseId } = req.params

  if (!ObjectId.isValid(responseId)) {
    return res.status(400).json({ error: "Invalid response ID" })
  }

  try {
    const updateData = req.body
    const allowedFields = ["atajo", "text", "image", "type", "status", "triggers"]

    // Filter only allowed fields
    const filteredUpdateData = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field]
      }
    }

    // Validate type if provided
    if (filteredUpdateData.type && !["text", "image", "mixed"].includes(filteredUpdateData.type)) {
      return res.status(400).json({
        error: "Invalid type. Must be 'text', 'image', or 'mixed'"
      })
    }

    // Validate status if provided
    if (filteredUpdateData.status !== undefined && typeof filteredUpdateData.status !== "boolean") {
      return res.status(400).json({
        error: "Status must be a boolean value"
      })
    }

    // Validate triggers if provided
    if (filteredUpdateData.triggers !== undefined && !Array.isArray(filteredUpdateData.triggers)) {
      return res.status(400).json({
        error: "Triggers must be an array of strings"
      })
    }

    // Check if trying to update atajo and if it conflicts with existing
    if (filteredUpdateData.atajo) {
      const db = await getDatabase()
      const existingResponse = await db.collection("responses").findOne({
        atajo: filteredUpdateData.atajo,
        _id: { $ne: new ObjectId(responseId) }
      })
      if (existingResponse) {
        return res.status(409).json({
          error: "A response with this atajo already exists"
        })
      }
    }

    const db = await getDatabase()

    // Check if response exists
    const existingResponse = await db.collection("responses").findOne({
      _id: new ObjectId(responseId)
    })

    if (!existingResponse) {
      return res.status(404).json({ error: "Response not found" })
    }

    // Add updatedAt timestamp
    filteredUpdateData.updatedAt = new Date()

    const result = await db.collection("responses").updateOne(
      { _id: new ObjectId(responseId) },
      { $set: filteredUpdateData }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Response not found" })
    }

    // Get updated response
    const updatedResponse = await db.collection("responses").findOne({
      _id: new ObjectId(responseId)
    })

    const transformedResponse = {
      _id: updatedResponse._id.toString(),
      atajo: updatedResponse.atajo,
      text: updatedResponse.text,
      image: updatedResponse.image,
      type: updatedResponse.type,
      status: updatedResponse.status,
      triggers: updatedResponse.triggers || [],
      createdAt: updatedResponse.createdAt,
      updatedAt: updatedResponse.updatedAt
    }

    res.json(transformedResponse)
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get specific response
router.get("/:responseId", async (req, res) => {
  if (handleCors(req, res)) return

  const { responseId } = req.params

  if (!ObjectId.isValid(responseId)) {
    return res.status(400).json({ error: "Invalid response ID" })
  }

  try {
    const db = await getDatabase()
    const response = await db.collection("responses").findOne({
      _id: new ObjectId(responseId)
    })

    if (!response) {
      return res.status(404).json({ error: "Response not found" })
    }

    const transformedResponse = {
      _id: response._id.toString(),
      atajo: response.atajo,
      text: response.text,
      image: response.image,
      type: response.type,
      status: response.status,
      triggers: response.triggers || [],
      createdAt: response.createdAt,
      updatedAt: response.updatedAt
    }

    res.json(transformedResponse)
  } catch (error) {
    console.error("Database error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
