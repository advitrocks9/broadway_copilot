import multer from 'multer';
import path from 'path';
import { ensureDir, userUploadDir } from '../../utils/paths';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
   const waId = (req.body.waId || 'anon') as string;
   const dir = userUploadDir(waId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${ts}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
