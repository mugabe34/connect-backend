import mongoose, { Schema, Document, Types } from "mongoose";

export type NotificationType = "like" | "message" | "system";

export interface INotification extends Document {
  sender?: Types.ObjectId;
  recipient: Types.ObjectId;
  type: NotificationType;
  message: string;
  product?: Types.ObjectId;
  read: boolean;
}

const NotificationSchema = new Schema<INotification>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User" },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "message", "system"], default: "system" },
    message: { type: String, required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...rest } = ret;
    return { id: _id, ...rest };
  }
});

export default mongoose.model<INotification>("Notification", NotificationSchema);
