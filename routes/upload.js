const express = require("express")
const multer = require("multer")
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const crypto = require("crypto")
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

// Nombre del bucket
const BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || ''

// Limpiar el endpoint S3 (remover el bucket si está incluido)
let S3_ENDPOINT = process.env.S3_ENDPOINT || ''
if (S3_ENDPOINT && BUCKET_NAME && S3_ENDPOINT.endsWith(`/${BUCKET_NAME}`)) {
  S3_ENDPOINT = S3_ENDPOINT.replace(`/${BUCKET_NAME}`, '')
}

// Configurar cliente S3 para R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || ''
  },
  forcePathStyle: true // Necesario para R2
})

// URL base del Worker que sirve las imágenes (o usar endpoint directo si no está configurado)
const CDN_URL = process.env.CLOUDFLARE_CDN_URL || `${S3_ENDPOINT}/${BUCKET_NAME}`

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
    const uniqueFilename = `${crypto.randomUUID()}.${fileExt}`
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

// Endpoint para probar la configuración de Cloudflare R2
router.get("/test-config", (req, res) => {
  if (handleCors(req, res)) return

  const config = {
    bucketName: BUCKET_NAME,
    cdnUrl: CDN_URL,
    s3Endpoint: S3_ENDPOINT,
    originalS3Endpoint: process.env.S3_ENDPOINT,
    hasAccessKey: !!process.env.CLOUDFLARE_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    bucketConfigured: !!BUCKET_NAME,
    endpointConfigured: !!S3_ENDPOINT
  }

  // Verificar si la configuración es completa
  const missing = []
  if (!BUCKET_NAME) missing.push('CLOUDFLARE_BUCKET_NAME')
  if (!S3_ENDPOINT) missing.push('S3_ENDPOINT')
  if (!process.env.CLOUDFLARE_ACCESS_KEY_ID) missing.push('CLOUDFLARE_ACCESS_KEY_ID')
  if (!process.env.CLOUDFLARE_SECRET_ACCESS_KEY) missing.push('CLOUDFLARE_SECRET_ACCESS_KEY')

  res.json({
    status: missing.length === 0 ? 'configured' : 'missing_variables',
    config,
    missing: missing.length > 0 ? missing : null,
    message: missing.length === 0 ?
      'Configuración completa para Cloudflare R2' :
      `Faltan las siguientes variables de entorno: ${missing.join(', ')}`
  })
})

module.exports = router
