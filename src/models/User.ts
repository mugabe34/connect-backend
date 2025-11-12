import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "buyer" | "seller" | "admin";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  phone?: string;
  location?: string; // district or similar
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ["buyer", "seller", "admin"], default: "buyer" },
    isActive: { type: Boolean, default: true },
    phone: { type: String },
    location: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        const { _id, __v, password, ...rest } = ret;
        return { id: _id, ...rest };
      }
    },
    toObject: {
      transform: function (doc, ret) {
        const { _id, __v, password, ...rest } = ret;
        return { id: _id, ...rest };
      }
    }
  }
);

UserSchema.pre("save", async function (next) {
  const user = this as IUser;
  if (!user.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(user.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string) {
  const user = await mongoose.model('User').findOne({ _id: this._id }).select('+password');
  if (!user) throw new Error('User not found during password comparison');
  return bcrypt.compare(candidate, user.password);
};

export default mongoose.model<IUser>("User", UserSchema);


