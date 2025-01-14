const mongoose = require("mongoose");

const CommunitySchema = new mongoose.Schema(
  {
    postBy: { type: String },
    post: { type: String },
    photos: { type: Array },
    likes: { type: Array },
    username: { type: String },
    name: { type: String },
    picture: { type: String },
    user: { type: Object },
    users: { type: Array },
    comments: { type: Array },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Community", CommunitySchema);
