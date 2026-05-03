const multer = require('multer');

// stockage en mémoire (compatible Vercel)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'video/mp4', 'video/quicktime', 'video/x-matroska'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Type de fichier non autorisé. PDF ou vidéo uniquement.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 }
});

module.exports = upload;