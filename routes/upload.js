const express = require("express")
const multer = require("multer")
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const { v4: uuidv4 } = require("uuid")
const sharp = require("sharp")
const { handleCors } = require("../lib/cors")

const router = express.Router()

// Configurar multer para memoria (sin guardar archivos localmente)
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite
  },
  fileFilter: (req, file, cb) => {
    // Solo permitir imágenes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false)
    }
  }
})

// Configurar cliente S3 para R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || ''
  }
})

// Nombre del bucket
const BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || ''
// URL base del Worker que sirve las imágenes
const CDN_URL = process.env.CLOUDFLARE_CDN_URL || ''

// Función auxiliar para subir a R2
async function uploadToR2(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000'
  })

  return s3Client.send(command)
}

// Endpoint para subir imágenes
router.post("/", upload.single('file'), async (req, res) => {
  if (handleCors(req, res)) return

  try {
    const file = req.file

    if (!file) {
      return res.status(400).json({ message: 'No se proporcionó ningún archivo' })
    }

    // Generar un nombre único para el archivo
    const fileExt = file.originalname.split('.').pop() || 'jpg'
    const uniqueFilename = `${uuidv4()}.${fileExt}`
    const webpFilename = uniqueFilename.replace(`.${fileExt}`, '.webp')

    // Usar el buffer del archivo subido
    const buffer = file.buffer

    // Procesar la imagen con sharp para crear diferentes tamaños
    const originalImage = sharp(buffer)
    const metadata = await originalImage.metadata()

    // Crear versiones de diferentes tamaños
    const smallBuffer = await sharp(buffer)
      .resize(300, null, { fit: 'inside' })
      .webp({ quality: 80 })
      .toBuffer()
    
    const originalBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer()

    // Subir cada versión a R2
    const uploadPromises = [
      uploadToR2(smallBuffer, `small/${webpFilename}`, 'image/webp'),
      uploadToR2(originalBuffer, `original/${webpFilename}`, 'image/webp')
    ]

    await Promise.all(uploadPromises)

    // Construir las URLs para cada tamaño
    const smallUrl = `${CDN_URL}/small/${webpFilename}`
    const originalUrl = `${CDN_URL}/original/${webpFilename}`

    // Devolver las URLs en el formato exacto que espera la función uploadImageToR2
    res.json({
      filename: webpFilename,
      originalUrl,
      sizes: {
        small: smallUrl,
        original: originalUrl
      }
    })

  } catch (error) {
    console.error('Error al procesar o subir la imagen:', error)
    res.status(500).json({
      message: error.message || 'Error desconocido'
    })
  }
})

module.exports = router
