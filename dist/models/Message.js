"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const MessageSchema = new mongoose_1.Schema({
    sender: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    fromAdmin: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
}, { timestamps: true });
MessageSchema.set('toJSON', {
    transform: (_doc, ret) => {
        const { _id, __v, ...rest } = ret;
        return { id: _id, ...rest };
    }
});
exports.default = (0, mongoose_1.model)('Message', MessageSchema);
