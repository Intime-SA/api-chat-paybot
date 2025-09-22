function setCorsHeaders(res, origin) {
    const isDevelopment = process.env.NODE_ENV === "development"
    const allowedOrigins = isDevelopment
      ? ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]
      : process.env.ALLOWED_ORIGINS?.split(",") || ["https://yourdomain.com"]

    // In development, allow localhost origins
    if (isDevelopment && origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
      res.setHeader("Access-Control-Allow-Origin", origin)
    }
    // In production, check against allowed origins
    else if (!isDevelopment && origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin)
    }
    // For other cases, don't set the origin header (browsers will block)

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("Access-Control-Allow-Credentials", "true")
}

function handleCors(req, res) {
    const origin = req.headers.origin
    setCorsHeaders(res, origin)

    if (req.method === "OPTIONS") {
      res.status(200).end()
      return true
    }

    return false
}
  
  module.exports = { setCorsHeaders, handleCors }
  