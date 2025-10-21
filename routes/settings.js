const express = require("express")
const { getDatabase } = require("../lib/mongodb")
const { ObjectId } = require("mongodb")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Update settings
router.post("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const db = await getDatabase()

    // ID específico del documento de settings
    const settingsId = "68f3e4f06bf3bb05a68d898f"

    const {
      profileImage,
      isConnected,
      displayName,
      platformLink,
      description,
      welcomeMessage,
      phone,
      timestamp
    } = req.body

    // Validar campos requeridos
    if (!displayName || !description || !welcomeMessage) {
      return res.status(400).json({
        error: "Missing required fields: displayName, description, and welcomeMessage are required",
      })
    }

    // Preparar el documento de settings
    const settingsData = {
      profileImage,
      isConnected: isConnected || false,
      displayName,
      platformLink,
      description,
      welcomeMessage,
      phone,
      timestamp: timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Actualizar el documento específico en la colección settings
    const result = await db.collection("settings").updateOne(
      { _id: new ObjectId(settingsId) },
      {
        $set: settingsData,
        $setOnInsert: { createdAt: new Date().toISOString() }
      },
      { upsert: true } // Crear si no existe
    )

    if (result.matchedCount === 0 && result.upsertedCount === 1) {
      console.log(`Settings document created with ID: ${result.upsertedId}`)
    } else if (result.modifiedCount > 0) {
      console.log(`Settings document updated`)
    }

    res.json({
      success: true,
      message: "Settings updated successfully",
      settings: {
        _id: settingsId,
        ...settingsData
      }
    })

  } catch (error) {
    console.error("Error updating settings:", error)
    res.status(500).json({
      error: "Internal server error",
      message: error.message
    })
  }
})

// Get current settings
router.get("/", async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const db = await getDatabase()

    // ID específico del documento de settings
    const settingsId = "68f3e4f06bf3bb05a68d898f"

    const settings = await db.collection("settings").findOne({
      _id: new ObjectId(settingsId)
    })

    if (!settings) {
      return res.status(404).json({
        error: "Settings not found"
      })
    }

    res.json({
      _id: settings._id.toString(),
      profileImage: settings.profileImage,
      isConnected: settings.isConnected,
      displayName: settings.displayName,
      platformLink: settings.platformLink,
      description: settings.description,
      welcomeMessage: settings.welcomeMessage,
      phone: settings.phone,
      timestamp: settings.timestamp,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt
    })

  } catch (error) {
    console.error("Error getting settings:", error)
    res.status(500).json({
      error: "Internal server error",
      message: error.message
    })
  }
})

module.exports = router
