const { MongoClient } = require("mongodb")

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp"
const options = {}

let clientPromise

async function getDatabase() {
  if (!clientPromise) {
    const client = new MongoClient(uri, options)
    clientPromise = client.connect()
  }

  try {
    const client = await clientPromise
    return client.db("chatapp")
  } catch (error) {
    console.warn("Failed to connect to MongoDB:", error.message)
    // For development, create a mock database object that doesn't throw errors
    // This allows the app to run even without MongoDB connection
    console.log("Using mock database - operations will be logged but not persisted")
    return createMockDatabase()
  }
}

// Mock database for development when MongoDB is not available
function createMockDatabase() {
  return {
    collection: (name) => ({
      find: () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              toArray: async () => []
            })
          })
        }),
        toArray: async () => []
      }),
      findOne: async () => null,
      insertOne: async () => ({ insertedId: Date.now().toString() }),
      updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      countDocuments: async () => 0,
      deleteOne: async () => ({ deletedCount: 0 }),
      deleteMany: async () => ({ deletedCount: 0 })
    })
  }
}

module.exports = { getDatabase }
