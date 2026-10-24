import { Schema, model } from "mongoose";

const SupportTicketSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  submissionKey: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true },
  description: { type: String, required: true, maxlength: 4000 },
  steps: { type: [String], default: [] },
  contactEmail: { type: String, default: "", maxlength: 254 },
  pagePath: { type: String, default: "", maxlength: 200 },
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
}, { timestamps: true });

export default model("SupportTicket", SupportTicketSchema);
