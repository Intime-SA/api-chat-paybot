const { MongoClient } = require("mongodb")

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URI
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
    console.error("Failed to connect to MongoDB:", error.message)
    throw new Error("Database connection failed. Please ensure MongoDB is running.")
  }
}

module.exports = { getDatabase }
