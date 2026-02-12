import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import Notification from '../models/Notification';

const router = Router();

// Get notifications for current user (as recipient)
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const notifications = await Notification.find({ recipient: req.user!.id })
      .populate('sender', 'name avatarUrl')
      .populate('product', 'title')
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

// Mark notification as read
router.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user!.id },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Error updating notification' });
  }
});

// Get unread count for current user
router.get('/count/unread', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user!.id,
      read: false
    });
    res.json({ unreadCount: count });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching unread count' });
  }
});

// Mark all notifications as read for current user
router.post('/mark-all-read', requireAuth, async (req: Request, res: Response) => {
  try {
    await Notification.updateMany({ recipient: req.user!.id, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating notifications' });
  }
});

export default router;
