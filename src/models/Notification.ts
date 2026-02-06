import mongoose, { Schema, Document, Types } from 'mongoose';

export type NotificationType = 'liked' | 'featured' | 'connected' | 'product_updated' | 'info';

export interface INotification extends Document {
  user: Types.ObjectId; // recipient
  actor?: Types.ObjectId; // who triggered
  type: NotificationType;
  data?: any;
  read: boolean;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['liked','featured','connected','product_updated','info'], required: true },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
