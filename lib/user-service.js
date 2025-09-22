const { getDatabase } = require("./mongodb")
const { ObjectId } = require("mongodb")

async function findOrCreateUserByPhone(phone) {
  try {
    const db = await getDatabase()

    // Buscar usuario existente por phone
    let user = await db.collection("users").findOne({ phone })

    if (!user) {
      // Crear nuevo usuario si no existe
      const newUser = {
        phone,
        rooms: [],
        createdAt: new Date().toISOString(),
        role: "user", // rol por defecto
      }

      const result = await db.collection("users").insertOne(newUser)
      user = { ...newUser, _id: result.insertedId }
    }

    return {
      id: user._id.toString(),
      phone: user.phone,
      rooms: user.rooms || [],
      role: user.role || "user",
      createdAt: user.createdAt,
    }
  } catch (error) {
    console.error("Error finding or creating user:", error)
    throw new Error(`Failed to find or create user: ${error.message}`)
  }
}

async function updateUserWithRoom(userId, roomId) {
  try {
    const db = await getDatabase()

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $addToSet: { rooms: new ObjectId(roomId) },
        $set: { updatedAt: new Date().toISOString() }
      }
    )
  } catch (error) {
    console.error("Error updating user with room:", error)
    throw new Error(`Failed to update user room: ${error.message}`)
  }
}

async function handleUserConnection(userId, socketId) {
  try {
    const db = await getDatabase()

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          socketId,
          connectedAt: new Date().toISOString(),
          isConnected: true,
        },
        $unset: { disconnectedAt: 1 } // remover disconnectedAt si existe
      }
    )
  } catch (error) {
    console.error("Error handling user connection:", error)
    throw new Error(`Failed to handle user connection: ${error.message}`)
  }
}

async function handleUserDisconnection(userId) {
  try {
    const db = await getDatabase()

    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          disconnectedAt: new Date().toISOString(),
          isConnected: false,
        },
        $unset: { socketId: 1 } // remover socketId
      }
    )
  } catch (error) {
    console.error("Error handling user disconnection:", error)
    throw new Error(`Failed to handle user disconnection: ${error.message}`)
  }
}

async function getUserById(userId) {
  try {
    const db = await getDatabase()
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) })

    if (!user) {
      throw new Error("User not found")
    }

    return {
      id: user._id.toString(),
      phone: user.phone,
      rooms: user.rooms || [],
      role: user.role || "user",
      socketId: user.socketId,
      connectedAt: user.connectedAt,
      disconnectedAt: user.disconnectedAt,
      isConnected: user.isConnected || false,
      createdAt: user.createdAt,
    }
  } catch (error) {
    console.error("Error getting user by ID:", error)
    throw new Error(`Failed to get user: ${error.message}`)
  }
}

module.exports = {
  findOrCreateUserByPhone,
  updateUserWithRoom,
  handleUserConnection,
  handleUserDisconnection,
  getUserById,
}
