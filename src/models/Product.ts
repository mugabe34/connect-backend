import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProduct extends Document {
  title: string;
  description: string;
  price: number;
  images: { url: string; publicId: string }[];
  category?: string;
  tags?: string[];
  seller: Types.ObjectId;
  contact: { email: string; phone?: string };
  approved: boolean;
  featured: boolean;
  likes: number;
  likedBy: Types.ObjectId[];
  location?: string; // seller location cached for fast filtering
}

const ProductSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true }
      }
    ],
    category: String,
    tags: [String],
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contact: {
      email: { type: String, required: true },
      phone: String
    },
    approved: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    location: { type: String }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        const { _id, __v, ...rest } = ret;
        return { id: _id, ...rest };
      }
    },
    toObject: {
      transform: function (_doc, ret) {
        const { _id, __v, ...rest } = ret;
        return { id: _id, ...rest };
      }
    }
  }
);

export default mongoose.model<IProduct>("Product", ProductSchema);


