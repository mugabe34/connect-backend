import { Schema, Document, model, Types } from 'mongoose';

export interface IMessage extends Document {
  sender: Types.ObjectId;
  recipient: Types.ObjectId;
  subject?: string;
  body: string;
  fromAdmin: boolean;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    fromAdmin: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, ...rest } = ret;
    return { id: _id, ...rest };
  }
});

export default model<IMessage>('Message', MessageSchema);

