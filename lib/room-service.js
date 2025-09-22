const { getDatabase } = require("./mongodb")

async function createRoom(params) {
  try {
    const db = await getDatabase()

  const { phone, channel, source, name, userAgent = "Unknown", ipAddress = "Unknown", createdFrom = "webhook" } = params

  // Generar nombre automático si no se proporciona
  const roomName = name || `Chat-${phone}-${channel}-${Date.now()}`

  const newRoom = {
    name: roomName,
    phone,
    channel,
    source,
    createdAt: new Date(),
    createdFrom,
    metadata: {
      userAgent,
      ipAddress,
      timestamp: new Date(),
      apiVersion: "v1",
    },
  }

    const result = await db.collection("rooms").insertOne(newRoom)

    return {
      id: result.insertedId.toString(),
      name: roomName,
      phone,
      channel,
      source,
      createdAt: newRoom.createdAt,
      createdFrom: newRoom.createdFrom,
      messageCount: 0,
      metadata: newRoom.metadata,
    }
  } catch (error) {
    console.error("Error creating room:", error)
    throw new Error(`Failed to create room: ${error.message}`)
  }
}

module.exports = { createRoom }
