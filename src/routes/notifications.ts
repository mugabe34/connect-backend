import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import Notification from '../models/Notification';

const router = Router();

// Get notifications for current user, newest first
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const items = await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(100);
  res.json(items);
});

router.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  const notif = await Notification.findById(req.params.id);
  if (!notif) return res.status(404).json({ message: 'Not found' });
  if (String(notif.user) !== req.user!.id) return res.status(403).json({ message: 'Forbidden' });
  notif.read = true;
  await notif.save();
  res.json(notif);
});

router.post('/mark-all-read', requireAuth, async (req: Request, res: Response) => {
  await Notification.updateMany({ user: req.user!.id, read: false }, { $set: { read: true } });
  res.json({ message: 'All marked read' });
});

export default router;
