import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import Message from '../models/Message';
import User from '../models/User';

const router = Router();

// Get messages for current user (as recipient)
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const messages = await Message.find({ recipient: req.user!.id })
    .populate('sender', 'name email role')
    .sort({ createdAt: -1 });
  res.json(messages);
});

// Mark message as read
router.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  const msg = await Message.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user!.id },
    { $set: { read: true } },
    { new: true }
  );
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  res.json(msg);
});

// Admin send message to seller (alternative endpoint when needed)
router.post('/to/:userId', requireAuth, async (req: Request, res: Response) => {
  const sender = await User.findById(req.user!.id);
  const recipient = await User.findById(req.params.userId);
  if (!sender || sender.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  if (!recipient || recipient.role !== 'seller') return res.status(400).json({ message: 'Recipient must be a seller' });
  const { subject, body } = req.body as { subject?: string; body?: string };
  if (!body) return res.status(400).json({ message: 'Message body is required' });
  const message = await Message.create({
    sender: sender.id,
    recipient: recipient.id,
    subject,
    body,
    fromAdmin: true,
  });
  res.status(201).json(message);
});

export default router;
