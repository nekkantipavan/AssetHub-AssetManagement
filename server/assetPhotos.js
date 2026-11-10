const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const multer = require('multer')

const maxPhotos = 5
const validId = value => /^\d{1,10}$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647
const validPhoto = value => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)

async function variants(buffer) {
  const sharp = require('sharp')
  const image = sharp(buffer, { limitInputPixels: 25_000_000, failOn: 'error' })
  const { format, pages } = await image.metadata()
  if (!['jpeg', 'png', 'webp'].includes(format) || (pages || 1) > 1) {
    throw new Error('Choose a still JPEG, PNG, or WebP image.')
  }
  return Promise.all([
    image.clone().rotate().resize(360, 360, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  ])
}

function registerAssetPhotos(app, { pool, authMiddleware, read, edit }) {
  const root = path.resolve(process.env.ASSET_PHOTO_DIR || path.join(__dirname, 'private-asset-photos'))
  const filename = (id, kind) => path.join(root, `${id}-${kind}.webp`)
  const cleanup = id => Promise.all(['thumb', 'full'].map(kind => fs.unlink(filename(id, kind)).catch(error => {
    if (error.code !== 'ENOENT') console.error('Asset photo cleanup failed:', error.code)
  })))
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }).single('photo')
  const validate = (req, res, next) => {
    if (!validId(req.params.id) || (req.params.photoId && !validPhoto(req.params.photoId))) {
      return res.status(404).json({ error: 'Asset photo not found.' })
    }
    next()
  }
  const failure = (res, error) => {
    console.error('Asset photos:', error.code || error.message)
    res.status(500).json({ error: 'Photos are unavailable. Please try again.' })
  }

  app.get('/api/assets/:id/photos', authMiddleware, read, validate, async (req, res) => {
    try {
      const result = await pool.query('SELECT id, label, created_at FROM asset_photos WHERE asset_id=$1 ORDER BY created_at, id LIMIT $2', [req.params.id, maxPhotos])
      res.set('Cache-Control', 'no-store').json(result.rows)
    } catch (error) { failure(res, error) }
  })

  app.get('/api/assets/:id/photos/:photoId/:kind', authMiddleware, read, validate, async (req, res) => {
    const { id, photoId, kind } = req.params
    if (!['thumb', 'full'].includes(kind)) return res.sendStatus(404)
    try {
      const photo = await pool.query('SELECT 1 FROM asset_photos WHERE id=$1 AND asset_id=$2', [photoId, id])
      if (!photo.rowCount) return res.sendStatus(404)
      res.vary('Authorization')
      res.type('image/webp').set('Cache-Control', 'private, no-cache')
      res.sendFile(filename(photoId, kind), { cacheControl: false }, error => {
        if (error && !res.headersSent) res.sendStatus(error.status === 404 ? 404 : 500)
      })
    } catch (error) { failure(res, error) }
  })

  app.post('/api/assets/:id/photos', authMiddleware, edit, validate, (req, res, next) => {
    upload(req, res, error => {
      if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload one image, up to 10 MB.' })
      next()
    })
  }, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a photo to upload.' })
    let thumb, full
    try { [thumb, full] = await variants(req.file.buffer) }
    catch { return res.status(422).json({ error: 'Choose a readable JPEG, PNG, or WebP photo under 25 megapixels.' }) }
    let db
    const photoId = randomUUID()
    try {
      db = await pool.connect()
      await db.query('BEGIN')
      const asset = await db.query('SELECT id FROM assets WHERE id=$1 FOR UPDATE', [req.params.id])
      const photos = await db.query('SELECT count(*)::int AS count FROM asset_photos WHERE asset_id=$1', [req.params.id])
      if (!asset.rowCount || photos.rows[0].count >= maxPhotos) {
        await db.query('ROLLBACK')
        return res.status(asset.rowCount ? 409 : 404).json({ error: asset.rowCount ? 'An asset can have up to five photos.' : 'Asset not found.' })
      }
      await fs.mkdir(root, { recursive: true, mode: 0o700 })
      await fs.writeFile(filename(photoId, 'thumb'), thumb, { flag: 'wx', mode: 0o600 })
      await fs.writeFile(filename(photoId, 'full'), full, { flag: 'wx', mode: 0o600 })
      const label = req.file.originalname.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) || 'Asset photo'
      const result = await db.query('INSERT INTO asset_photos (id, asset_id, label) VALUES ($1, $2, $3) RETURNING id, label, created_at', [photoId, req.params.id, label])
      await db.query('COMMIT')
      res.status(201).json(result.rows[0])
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {})
      await cleanup(photoId)
      failure(res, error)
    } finally { db?.release() }
  })

  app.delete('/api/assets/:id/photos/:photoId', authMiddleware, edit, validate, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM asset_photos WHERE asset_id=$1 AND id=$2 RETURNING id', [req.params.id, req.params.photoId])
      if (!result.rowCount) return res.sendStatus(404)
      await cleanup(req.params.photoId)
      res.sendStatus(204)
    } catch (error) { failure(res, error) }
  })
  return cleanup
}

module.exports = { registerAssetPhotos, variants }
